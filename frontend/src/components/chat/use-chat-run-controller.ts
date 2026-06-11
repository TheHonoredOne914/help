import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getGetAnthropicConversationQueryKey,
  getListAnthropicConversationsQueryKey,
  type AnthropicConversation,
  type AnthropicMessage,
} from "@/lib/api-client";
import { apiFetch } from "@/lib/api-fetch";
import { getProviderHeaders } from "@/lib/provider-keys";
import type { PipelineAction } from "@/hooks/use-pipeline-state";
import { getSystemPromptForMode } from "./settings-dialog";
import { buildChatRequestBody } from "./chat-request-builder";
import type { ChatMode, NormalModel, RhetoricsType } from "./chat-model-routing";
import {
  RETRIEVING_COUNCILLOR_IDS,
  type ClaimObject,
  type CouncilDispute,
  type CouncilSeal,
  type CouncilVerdict,
  type CouncillorOutput,
  type RetrievingCouncillorId,
} from "../council/council-types";
import { extractCitedSourceNums } from "./chat-metadata-utils";
import { recordModelUse } from "./model-limits";
import { DEFAULT_GROQ_MODEL } from "./provider-model-display";
import { getStreamSilenceTimeoutMs } from "./stream-timeout";
import {
  markCitationStatusReceived,
  normalizeStreamEvent,
  updateTerminalEventState,
  type ChatRunIdentity,
  type StreamTerminalEventState,
} from "./stream-event-normalizer";
import { globalStreamRegistry } from "@/lib/global-stream-registry";

type ToastFn = (props: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
}) => void;

interface UseChatRunControllerInput {
  dispatchPipeline: Dispatch<PipelineAction>;
  toast: ToastFn;
  setDebateSuggestions: Dispatch<SetStateAction<string[]>>;
  setTokensPerSec: Dispatch<SetStateAction<number | null>>;
  normalModel: string;
  autoFallback: boolean;
  getPrimaryModelForMode: (mode: ChatMode, fallbackNormalModel?: string) => string;
  getModelsForMode: (mode: ChatMode, fallbackNormalModel?: string) => string[];
}

interface UseChatRunControllerResult {
  runStream: (
    convId: number,
    messageContent: string,
    nm?: NormalModel,
    mode?: ChatMode,
    rhetoricsOpts?: { rhetoricsType: RhetoricsType; creativity: number },
  ) => Promise<boolean>;
  handleStop: () => void;
  abortAllStreams: () => void;
  abortStreamsForConversation: (conversationId: number | null | undefined) => void;
}

const TERMINAL_INITIAL_STATE: StreamTerminalEventState = {
  failureReceived: false,
  successReceived: false,
  receivedDone: false,
  citationStatusReceived: false,
  finalStatus: null,
};

const RETRIEVING_COUNCILLOR_ID_SET = new Set<string>(RETRIEVING_COUNCILLOR_IDS);

function createClientRunId(): string {
  return `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function providerLabelForModel(modelId: string): string {
  if (modelId.startsWith("nvidia/")) return "nvidia";
  if (modelId.startsWith("ollama/")) return "ollama";
  if (modelId.startsWith("gemini/")) return "gemini";
  if (modelId.startsWith("openrouter/")) return "openrouter";
  if (modelId.startsWith("github/")) return "github";
  return "groq";
}

function streamErrorMessage(data: Record<string, unknown>): { code?: string; message: string } {
  const error = data.error && typeof data.error === "object"
    ? data.error as { code?: string; message?: string }
    : null;
  return {
    code: error?.code ?? (typeof data.code === "string" ? data.code : undefined),
    message: String(error?.message ?? data.message ?? data.providerError ?? data.error ?? "The research run could not complete."),
  };
}

function mergeStreamedAssistantMessage(queryClient: QueryClient, convId: number, content: string): void {
  const cleanContent = content.trim();
  if (!cleanContent) return;
  queryClient.setQueryData(getGetAnthropicConversationQueryKey(convId), (old: AnthropicConversation | undefined) => {
    if (!old) return old;
    const messages = old.messages ?? [];
    if (messages.some((msg) => msg.role === "assistant" && msg.content.trim() === cleanContent)) return old;
    const assistantMessage: AnthropicMessage = {
      id: -Date.now(),
      conversationId: convId,
      role: "assistant",
      content: cleanContent,
      createdAt: new Date().toISOString(),
    };
    return {
      ...old,
      messages: [...messages, assistantMessage],
    };
  });
}

async function hydrateConversationFromServer(queryClient: QueryClient, convId: number): Promise<void> {
  try {
    const response = await apiFetch(`/api/anthropic/conversations/${convId}`);
    if (!response.ok) return;
    const conversation = await response.json() as AnthropicConversation;
    if (conversation && Array.isArray(conversation.messages)) {
      queryClient.setQueryData(getGetAnthropicConversationQueryKey(convId), conversation);
    }
  } catch {
    // The normal invalidation below still gives React Query a retry path.
  }
}

export function useChatRunController({
  dispatchPipeline,
  toast,
  setDebateSuggestions,
  setTokensPerSec,
  normalModel,
  autoFallback,
  getPrimaryModelForMode,
  getModelsForMode,
}: UseChatRunControllerInput): UseChatRunControllerResult {
  const queryClient = useQueryClient();
  const streamStartRef = useRef<number>(0);
  const streamCharsRef = useRef<number>(0);
  const silenceTimerResetRef = useRef<(() => void) | null>(null);

  const abortAllStreams = useCallback(() => {
    globalStreamRegistry.abortAll();
    globalStreamRegistry.clearActiveRun();
  }, []);

  const handleStop = useCallback(() => {
    const activeRunId = globalStreamRegistry.getActiveRun().runId;
    globalStreamRegistry.abortRun(activeRunId);
    if (activeRunId) {
      dispatchPipeline({ type: "RUN_STATUS", status: "cancelled" });
    }
    globalStreamRegistry.clearActiveRun();
  }, [dispatchPipeline]);

  const abortStreamsForConversation = useCallback((conversationId: number | null | undefined) => {
    globalStreamRegistry.abortConversation(conversationId);
    if (globalStreamRegistry.getActiveRun().conversationId === conversationId) {
      globalStreamRegistry.clearActiveRun();
    }
  }, []);

  useEffect(() => {
    return () => abortAllStreams();
  }, [abortAllStreams]);

  const runStream = useCallback(async (
    convId: number,
    messageContent: string,
    nm: NormalModel = DEFAULT_GROQ_MODEL,
    mode: ChatMode = "normal",
    rhetoricsOpts?: { rhetoricsType: RhetoricsType; creativity: number },
  ): Promise<boolean> => {
    const userSystemPrompt = rhetoricsOpts ? "" : getSystemPromptForMode(mode);
    const activeProviderModel = getPrimaryModelForMode(mode, nm);
    const modelsForMode = getModelsForMode(mode, nm);
    const controller = new AbortController();
    const clientRunId = createClientRunId();
    let streamRunId = clientRunId;
    let gotContent = false;
    let streamedAssistantText = "";
    let streamSucceeded = false;

    if (globalStreamRegistry.getActiveRun().runId && globalStreamRegistry.getActiveRun().conversationId === convId) {
      globalStreamRegistry.abortRun(globalStreamRegistry.getActiveRun().runId);
      dispatchPipeline({ type: "RUN_STATUS", status: "cancelled" });
    }

    globalStreamRegistry.setActiveRun({
      runId: clientRunId,
      assistantMessageId: null,
      conversationId: convId,
      researchMode: mode,
    });
    globalStreamRegistry.add(clientRunId, controller, convId);
    dispatchPipeline({ type: "SET_ACTIVE_RUN", runId: clientRunId, conversationId: convId });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        silenceTimerResetRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let keepaliveWorker: { worker: Worker; url: string } | null = null;
    try {
      const code = `setInterval(() => postMessage("ping"), 8000)`;
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      keepaliveWorker = { worker: new Worker(url), url };
      // Fix (Bug: L172): add onmessage so "ping" messages are consumed and don't queue up
      keepaliveWorker.worker.onmessage = () => {};
    } catch {
      // CSP-restricted environments can run without this background-tab keepalive.
    }

    try {
      streamStartRef.current = Date.now();
      streamCharsRef.current = 0;
      setTokensPerSec(null);

      const response = await apiFetch(`/api/anthropic/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream", ...getProviderHeaders() },
        body: JSON.stringify(buildChatRequestBody({
          content: messageContent,
          mode,
          normalModel: nm,
          activeProviderModel,
          modelsForMode,
          autoFallback,
          userSystemPrompt,
          rhetoricsOpts,
        })),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`;
        try {
          const rawError = await response.text();
          if (rawError) {
            try {
              const parsed = JSON.parse(rawError);
              errorMessage = String(parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? rawError);
            } catch {
              errorMessage = rawError;
            }
          }
        } catch {
          // Keep the status-derived message.
        }

        // Fix (Bug: L219): expand to include more server/provider error codes
        const providerLikeFailure = [401, 403, 408, 409, 429, 499, 500, 502, 503, 504, 507, 529].includes(response.status);
        dispatchPipeline({ type: "RUN_STATUS", status: providerLikeFailure ? "provider_error" : "failed" });
        toast({
          title: providerLikeFailure ? "Provider error" : "Stream request failed",
          description: errorMessage,
          variant: "destructive",
        });
        return false;
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminalState = { ...TERMINAL_INITIAL_STATE };
      const activeModels = mode !== "normal" ? modelsForMode : [];
      const silenceTimeoutMs = getStreamSilenceTimeoutMs(mode, activeModels);
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      let streamAborted = false;

      const resetSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (!streamAborted) {
            streamAborted = true;
            controller.abort();
            toast({
              title: "Connection lost",
              description: `No response for ${Math.round(silenceTimeoutMs / 1000)}s. Your message was saved. Try again.`,
              variant: "destructive",
            });
          }
        }, silenceTimeoutMs);
      };
      silenceTimerResetRef.current = resetSilenceTimer;
      resetSilenceTimer();

      try {
        while (true) {
          let readResult: ReadableStreamReadResult<Uint8Array>;
          try {
            readResult = await reader.read();
          } catch (readErr) {
            if ((readErr as any)?.name === "AbortError") break;
            throw readErr;
          }

          const { value, done } = readResult;
          if (done) {
            // Fix (Bug: L260): flush any remaining partial line from buffer on stream close
            if (buffer.trim()) {
              const remaining = buffer.trim();
              if (remaining.startsWith("data: ")) {
                const dataStr = remaining.slice(6);
                if (dataStr.trim()) {
                  try {
                    const flushedData = JSON.parse(dataStr) as Record<string, unknown>;
                    const normalized = normalizeStreamEvent(flushedData, globalStreamRegistry.getActiveRun(), convId);
                    if (normalized.kind === "terminal") {
                      terminalState = updateTerminalEventState(terminalState, normalized);
                    }
                  } catch {
                    // ignore malformed final chunk
                  }
                }
              }
            }
            break;
          }

          resetSilenceTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (controller.signal.aborted) break;
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;

            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              const normalized = normalizeStreamEvent(data, globalStreamRegistry.getActiveRun(), convId);

              if (normalized.kind === "run_started") {
                const previousRunId = globalStreamRegistry.getActiveRun().runId;
                const nextRunId = normalized.nextIdentity.runId;
                if (nextRunId) streamRunId = nextRunId;
                if (
                  previousRunId &&
                  nextRunId &&
                  previousRunId !== nextRunId
                ) {
                  globalStreamRegistry.move(previousRunId, nextRunId);
                }
                globalStreamRegistry.setActiveRun(normalized.nextIdentity);
                dispatchPipeline({
                  type: "SET_ACTIVE_RUN",
                  runId: String(normalized.nextIdentity.runId),
                  assistantMessageId: normalized.nextIdentity.assistantMessageId ?? null,
                  conversationId: normalized.nextIdentity.conversationId ?? convId,
                });
              }

              if (normalized.kind === "ignored_stale") {
                dispatchPipeline({ type: "IGNORED_STALE_EVENT" });
                continue;
              }

              if (normalized.kind === "terminal") {
                terminalState = updateTerminalEventState(terminalState, normalized);
              }

              if (data.phase === "planning_queries") {
                dispatchPipeline({
                  type: "PLANNING",
                  plannerModel: typeof data.plannerModel === "string"
                    ? data.plannerModel
                    : typeof data.model === "string"
                      ? data.model
                      : null,
                });
              }
              if (Array.isArray(data.effectiveModels)) {
                dispatchPipeline({ type: "EFFECTIVE_MODELS", models: data.effectiveModels as string[] });
              }
              if (data.type === "agenda_class" && typeof data.agendaClass === "string" && typeof data.committeeType === "string") {
                dispatchPipeline({ type: "AGENDA_CLASS", agendaClass: data.agendaClass, committeeType: data.committeeType });
              }
              if (data.type === "dimension_scores" && Array.isArray(data.scores)) {
                dispatchPipeline({ type: "DIMENSION_SCORES", scores: data.scores as any });
              }
              if (
                data.divisionProgress &&
                typeof data.divisionProgress === "object" &&
                typeof (data.divisionProgress as any).current === "number" &&
                typeof (data.divisionProgress as any).total === "number"
              ) {
                dispatchPipeline({
                  type: "DIVISION_PROGRESS",
                  current: (data.divisionProgress as any).current,
                  total: (data.divisionProgress as any).total,
                });
              }
              if (data.type === "division_started" && typeof data.division === "string") {
                dispatchPipeline({
                  type: "DIVISION_STARTED",
                  division: data.division,
                  dimensionClass: data.dimensionClass === "secondary" ? "secondary" : "primary",
                });
              }
              if (data.type === "division_complete" && typeof data.division === "string") {
                dispatchPipeline({
                  type: "DIVISION_COMPLETE",
                  division: data.division,
                  wordCount: typeof data.wordCount === "number" ? data.wordCount : 0,
                  citationCount: typeof data.citationCount === "number" ? data.citationCount : 0,
                });
              }
              if (typeof data.divisionComplete === "string") {
                dispatchPipeline({
                  type: "DIVISION_COMPLETE",
                  division: data.divisionComplete,
                  wordCount: typeof data.wordCount === "number" ? data.wordCount : 0,
                  citationCount: typeof data.citationCount === "number" ? data.citationCount : 0,
                });
              }
              if (data.type === "evidence_registry" && data.registry) {
                dispatchPipeline({ type: "EVIDENCE_REGISTRY", registry: data.registry as any });
              }
              if (typeof data.corePipelineEvent === "string") {
                dispatchPipeline({
                  type: "CORE_PIPELINE_EVENT",
                  event: {
                    type: data.corePipelineEvent,
                    timestamp: Date.now(),
                    data: data.corePipelineData && typeof data.corePipelineData === "object"
                      ? data.corePipelineData as Record<string, unknown>
                      : undefined,
                  },
                });
              }
              if (data.sourceContract && typeof data.sourceContract === "object") {
                dispatchPipeline({ type: "SOURCE_CONTRACT", contract: data.sourceContract as any });
              }
              if (data.sourceGapReport && typeof data.sourceGapReport === "object") {
                dispatchPipeline({ type: "SOURCE_GAP_REPORT", report: data.sourceGapReport as any });
              }
              if (data.coreQualityGate && typeof data.coreQualityGate === "object") {
                dispatchPipeline({ type: "CORE_QUALITY_GATE", gate: data.coreQualityGate as any });
              }
              if (data.citationStatus && typeof data.citationStatus === "object") {
                terminalState = markCitationStatusReceived(terminalState);
                dispatchPipeline({ type: "CITATION_STATUS", status: data.citationStatus as any });
              }
              if (typeof data.selectedResearchMode === "string") {
                dispatchPipeline({ type: "SELECTED_RESEARCH_MODE", mode: data.selectedResearchMode as any });
              }
              if (typeof data.effectiveResearchMode === "string") {
                dispatchPipeline({ type: "SELECTED_RESEARCH_MODE", mode: data.effectiveResearchMode as any });
              }
              if (data.eventType === "council_c_started" && isRetrievingCouncillorId(data.councillorId)) {
                dispatchPipeline({
                  type: "COUNCIL_C_STARTED",
                  councillorId: data.councillorId,
                  title: typeof data.title === "string" ? data.title : data.councillorId,
                });
              }
              if (data.eventType === "council_c_chunk" && isRetrievingCouncillorId(data.councillorId) && typeof data.chunk === "string") {
                dispatchPipeline({ type: "COUNCIL_C_CHUNK", councillorId: data.councillorId, chunk: data.chunk });
              }
              if (data.eventType === "council_c_complete") {
                const councillor = normalizeCouncillorOutput(data.councillor);
                if (councillor) dispatchPipeline({ type: "COUNCIL_C_COMPLETE", councillor });
              }
              if (data.eventType === "deliberation_update") {
                dispatchPipeline({
                  type: "DELIBERATION_UPDATE",
                  seals: normalizeCouncilSealArray(data.seals),
                  disputes: normalizeCouncilDisputeArray(data.disputes),
                  agreementScore: typeof data.agreementScore === "number"
                    ? data.agreementScore
                    : typeof data.agreement_score === "number"
                      ? data.agreement_score
                      : 0,
                });
              }
              if (data.eventType === "chief_verdict_chunk" && typeof data.chunk === "string") {
                dispatchPipeline({ type: "CHIEF_VERDICT_CHUNK", chunk: data.chunk });
              }
              if (data.eventType === "chief_verdict_complete") {
                dispatchPipeline({ type: "CHIEF_VERDICT_COMPLETE", verdict: normalizeCouncilVerdict(data.verdict) });
              }
              if (data.archiveRouting && typeof data.archiveRouting === "object") {
                dispatchPipeline({ type: "ARCHIVE_ROUTING", routing: data.archiveRouting as any });
              }
              if (Array.isArray(data.researchAngles)) {
                dispatchPipeline({ type: "RESEARCH_ANGLES", angles: data.researchAngles as any });
              }
              if (typeof data.legacyFallbackUsed === "boolean") {
                dispatchPipeline({ type: "LEGACY_FALLBACK_USED", used: data.legacyFallbackUsed });
              }
              if (data.fullSourceManifest && typeof data.fullSourceManifest === "object" && Array.isArray((data.fullSourceManifest as any).sources)) {
                dispatchPipeline({ type: "FULL_SOURCE_MANIFEST", manifest: data.fullSourceManifest as any });
              }
              if (data.researchPlan && Array.isArray(data.researchPlan)) {
                dispatchPipeline({ type: "RESEARCH_PLAN", subQueries: data.researchPlan as string[] });
              }
              if (data.topicStrategyBuilt && data.topicStrategy) {
                dispatchPipeline({ type: "TOPIC_STRATEGY", strategy: data.topicStrategy as any });
              }
              if (data.plannerRoles && typeof data.plannerRoles === "object") {
                dispatchPipeline({ type: "PLANNER_ROLES", plannerRoles: data.plannerRoles as any });
              }
              if (data.searching) {
                dispatchPipeline({ type: "SEARCHING", model: String(data.model ?? normalModel), query: String(data.searching) });
              }
              if (typeof data.queriesPlanned === "number") {
                const plannedModel = typeof data.model === "string"
                  ? data.model
                  : typeof data.modelKey === "string"
                    ? data.modelKey
                    : normalModel;
                dispatchPipeline({ type: "QUERIES_PLANNED", model: plannedModel, count: data.queriesPlanned });
              }

              if (data.found) {
                const foundModelKey = typeof data.model === "string"
                  ? data.model
                  : typeof data.modelKey === "string"
                    ? data.modelKey
                    : typeof data.rawModelId === "string"
                      ? data.rawModelId
                      : normalModel;
                dispatchPipeline({ type: "FOUND", model: foundModelKey, results: data.found as any });
              }

              if (data.phase === "decomposing" && typeof data.model === "string") {
                dispatchPipeline({ type: "SEARCHING", model: data.model, query: "Generating research queries..." });
              }
              if (typeof data.batchStart === "string" && typeof data.role === "string") {
                dispatchPipeline({
                  type: "BATCH_START",
                  batchName: data.batchStart,
                  role: data.role as any,
                  models: Array.isArray(data.models) ? data.models as string[] : [],
                });
              }
              if (data.dataCheatsheet) {
                dispatchPipeline({ type: "DATA_CHEATSHEET", cheatsheet: data.dataCheatsheet as any });
              }
              if (typeof data.batchComplete === "string" && typeof data.role === "string") {
                dispatchPipeline({
                  type: "BATCH_COMPLETE",
                  batchName: data.batchComplete,
                  role: data.role as any,
                  findings: Array.isArray(data.findings) ? data.findings as string[] : [],
                  numbers: Array.isArray(data.numbers) ? data.numbers as string[] : [],
                  percentages: Array.isArray(data.percentages) ? data.percentages as string[] : [],
                  judgements: Array.isArray(data.judgements) ? data.judgements as any : [],
                  govReports: Array.isArray(data.govReports) ? data.govReports as string[] : [],
                });
              }
              if (data.discussing) dispatchPipeline({ type: "DISCUSSING" });
              if (typeof data.discussion === "string") dispatchPipeline({ type: "DISCUSSION", text: data.discussion });
              if (data.synthesizing) dispatchPipeline({ type: "SYNTHESIZING" });
              if (data.geminiSynthesizing) dispatchPipeline({ type: "GEMINI_SYNTHESIZING" });
              if (data.drafting && typeof data.model === "string") {
                dispatchPipeline({ type: "DRAFTING", model: data.model });
              }
              if (data.draftComplete && typeof data.model === "string") {
                dispatchPipeline({ type: "DRAFT_COMPLETE", model: data.model });
              }
              if (data.verifying) dispatchPipeline({ type: "VERIFYING" });
              if (data.qwenThinking) dispatchPipeline({ type: "QWEN_THINKING", text: String(data.qwenThinking) });
              if (typeof data.qwenThinkingChunk === "string") {
                dispatchPipeline({ type: "QWEN_THINKING_CHUNK", chunk: data.qwenThinkingChunk });
              }

              if (data.modelExhausted) {
                dispatchPipeline({ type: "MODEL_EXHAUSTED", key: String(data.modelExhausted), reason: String(data.reason ?? "error") });
              }
              if (data.bothExhausted) dispatchPipeline({ type: "BOTH_EXHAUSTED" });

              if (data.verified) {
                dispatchPipeline({ type: "VERIFIED", verification: data.verified as any });
                recordModelUse("groq");
              }
              if (data.fallback) dispatchPipeline({ type: "FALLBACK", model: String(data.fallback) });

              if (typeof data.content === "string") {
                const contentChunk = data.content;
                streamedAssistantText += contentChunk;
                dispatchPipeline({ type: "CONTENT", chunk: contentChunk });
                streamCharsRef.current += contentChunk.length;
                gotContent = true;
              }

              // Fix (Bug: L564): guard against 0 or negative total to prevent bogus progress display
              if (data.fetching && typeof data.fetching === "object" && typeof (data.fetching as any).total === "number" && (data.fetching as any).total > 0) {
                dispatchPipeline({ type: "FETCHING", total: (data.fetching as any).total });
              }
              if (data.fetched && typeof data.fetched === "object" && typeof (data.fetched as any).i === "number") {
                dispatchPipeline({
                  type: "FETCHED",
                  i: (data.fetched as any).i,
                  total: (data.fetched as any).total,
                  url: (data.fetched as any).url,
                });
              }
              if (data.citationWarning) {
                dispatchPipeline({ type: "CITATION_WARNING", count: Number(data.count ?? 0) });
              }
              if (data.citationCoverage) {
                dispatchPipeline({ type: "CITATION_COVERAGE", coverage: data.citationCoverage as any });
              }
              if (data.divisionOutputs && typeof data.divisionOutputs === "object") {
                dispatchPipeline({ type: "DIVISION_OUTPUTS", outputs: data.divisionOutputs as Record<string, string> });
              }
              if (Array.isArray(data.suggestions)) {
                setDebateSuggestions((data.suggestions as string[]).slice(0, 3));
              }
              if (typeof data.tokensPerSec === "number") {
                setTokensPerSec(data.tokensPerSec);
              }
              // Fix (Bug: L527): improve clarity of the model not available toast
              if (data.modelNotPulled) {
                const modelName = typeof data.modelId === "string" ? data.modelId : "Selected model";
                toast({
                  title: "Model not available",
                  description: `${modelName} could not be pulled. It may not be installed in this environment. Try a different model.`,
                  variant: "destructive",
                  duration: 10000,
                });
              }
              // Fix (Bug: L597): handle both camelCase and snake_case rate limit flag
              // Fix (Bug: L534): add duration so the toast auto-dismisses
              if (data.rateLimited || data.rate_limited) {
                toast({
                  title: "Groq rate-limited",
                  description: "Please slow down a bit, or switch to a smaller model.",
                  variant: "destructive",
                  duration: 8000,
                });
              }

              // Fix (Bug: L605): guard against double COMPLETE dispatch with successReceived flag
              if (normalized.kind === "terminal" && !normalized.failure && !terminalState.failureReceived && !terminalState.successReceived) {
                terminalState = {
                  ...terminalState,
                  receivedDone: normalized.done,
                  successReceived: true,
                  finalStatus: normalized.status,
                };
                if (!terminalState.citationStatusReceived) {
                  dispatchPipeline({ type: "SET_CITED_NUMS", citedNums: extractCitedSourceNums(streamedAssistantText) });
                }
                dispatchPipeline({ type: "RUN_STATUS", status: normalized.status });
                dispatchPipeline({ type: "COMPLETE" });
                recordModelUse("groq");
                window.dispatchEvent(new CustomEvent("bestdel:chat-provider-success", {
                  detail: { provider: providerLabelForModel(activeProviderModel), model: activeProviderModel },
                }));
                const elapsed = (Date.now() - streamStartRef.current) / 1000;
                if (elapsed > 0.2 && streamCharsRef.current > 0) {
                  const tps = Math.round(streamCharsRef.current / 4 / elapsed);
                  setTokensPerSec((prev) => prev ?? tps);
                }
              }

              if (data.eventType === "cancelled") {
                terminalState = {
                  ...terminalState,
                  failureReceived: true,
                  successReceived: false,
                  receivedDone: false,
                  finalStatus: "cancelled",
                };
                dispatchPipeline({ type: "RUN_STATUS", status: "cancelled" });
              }
              // Fix (Bug: L575, L638): handle pipeline_failed event type in addition to failed/provider_error
              if (data.eventType === "pipeline_failed") {
                const streamError = streamErrorMessage(data);
                terminalState = {
                  ...terminalState,
                  failureReceived: true,
                  successReceived: false,
                  receivedDone: false,
                  finalStatus: "failed",
                };
                dispatchPipeline({ type: "RUN_STATUS", status: "failed" });
                toast({
                  title: "Pipeline failed",
                  description: streamError.message,
                  variant: "destructive",
                });
              }
              if (data.eventType === "failed" || data.eventType === "provider_error") {
                const streamError = streamErrorMessage(data);
                terminalState = {
                  ...terminalState,
                  failureReceived: true,
                  successReceived: false,
                  receivedDone: false,
                  finalStatus: data.eventType === "provider_error" ? "provider_error" : "failed",
                };
                dispatchPipeline({ type: "RUN_STATUS", status: data.eventType === "provider_error" ? "provider_error" : "failed" });
                const sourceUsageFailed = streamError.code === "SOURCE_USAGE_VALIDATION_FAILED";
                toast({
                  title: sourceUsageFailed ? "Source Usage Failed" : data.eventType === "provider_error" ? "Provider error" : "Research failed",
                  description: sourceUsageFailed
                    ? "Model listed source IDs without extracting/supporting claims. Retrying paths were exhausted."
                    : streamError.message,
                  variant: "destructive",
                });
              }
              if (data.error && typeof data.error === "string") {
                console.error("Stream error:", data.error);
                toast({ title: "Stream error", description: data.error, variant: "destructive" });
              }
            } catch (e) {
              console.error("Failed to parse SSE data", e);
            }
          }
        }
      } finally {
        if (silenceTimer) clearTimeout(silenceTimer);
      }

      streamSucceeded = !terminalState.failureReceived && (gotContent || terminalState.successReceived || terminalState.receivedDone);
      
      // Fix: If the stream closed but we never received a terminal event from the backend,
      // force transition the pipeline out of the "running" state so the UI doesn't lock up.
      if (!terminalState.failureReceived && !terminalState.successReceived) {
        dispatchPipeline({ type: "RUN_STATUS", status: streamSucceeded ? "completed" : "failed" });
        dispatchPipeline({ type: "COMPLETE" });
      }

      return streamSucceeded;
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      silenceTimerResetRef.current = null;
      if (keepaliveWorker) {
        keepaliveWorker.worker.terminate();
        URL.revokeObjectURL(keepaliveWorker.url);
        keepaliveWorker = null;
      }
      const serverAssistantMessageId = globalStreamRegistry.getActiveRun().assistantMessageId;
      // Fix (Bug: L696): Only add optimistic message if hydration from server will definitely not find it.
      // Skip merge if we're about to hydrate from server anyway, since server-side message is authoritative.
      // Only add optimistic message for modes where server explicitly doesn't return assistantMessageId (rare edge case).
      // For normal/most flows: hydrate first, then check if we need the optimistic fallback.
      if (streamSucceeded && gotContent && streamedAssistantText.trim()) {
        // Always hydrate from server first — it's the source of truth
        await hydrateConversationFromServer(queryClient, convId);
        // Only add optimistic message if the hydration didn't find it AND serverAssistantMessageId was never set
        const currentConv = queryClient.getQueryData(getGetAnthropicConversationQueryKey(convId)) as AnthropicConversation | undefined;
        const hasMessage = currentConv?.messages?.some(
          msg => msg.role === "assistant" && msg.content.trim() === streamedAssistantText.trim()
        );
        if (!hasMessage && serverAssistantMessageId == null) {
          mergeStreamedAssistantMessage(queryClient, convId, streamedAssistantText);
        }
      } else if (streamSucceeded) {
        await hydrateConversationFromServer(queryClient, convId);
      }
      if (streamRunId) globalStreamRegistry.abortRun(streamRunId);
      if (globalStreamRegistry.getActiveRun().runId === streamRunId) {
        globalStreamRegistry.clearActiveRun();
      }
      dispatchPipeline({ type: "CLEAR_CURRENT_SEARCH" });
      await queryClient.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(convId) });
      queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    }
  }, [
    dispatchPipeline,
    autoFallback,
    getModelsForMode,
    getPrimaryModelForMode,
    normalModel,
    queryClient,
    setDebateSuggestions,
    setTokensPerSec,
    toast,
  ]);

  return { runStream, handleStop, abortAllStreams, abortStreamsForConversation };
}

function isRetrievingCouncillorId(value: unknown): value is RetrievingCouncillorId {
  return typeof value === "string" && RETRIEVING_COUNCILLOR_ID_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function normalizeCouncillorOutput(value: unknown): CouncillorOutput | null {
  if (!isRecord(value)) return null;
  const councillorId = value.councillorId ?? value.councillor_id;
  if (!isRetrievingCouncillorId(councillorId)) return null;
  const completedAt = stringField(value.completed_at ?? value.completedAt);
  const error = stringField(value.error);
  return {
    councillor_id: councillorId,
    title: typeof value.title === "string" ? value.title : councillorId,
    perspective: stringField(value.perspective),
    status: value.status === "failed" || value.status === "pending" || value.status === "running" || value.status === "complete" ? value.status : "complete",
    summary: stringField(value.summary),
    raw_brief: stringField(value.raw_brief ?? value.text),
    key_claims: arrayField(value.key_claims ?? value.keyClaims).map(normalizeClaimObject).filter(isClaimObject),
    sources_used: arrayField(value.sources_used ?? value.sourcesUsed).filter(isString),
    evidence_pack_ids: arrayField(value.evidence_pack_ids ?? value.evidencePackIds).filter(isString),
    started_at: stringField(value.started_at ?? value.startedAt) || new Date().toISOString(),
    completed_at: completedAt || undefined,
    error: error || undefined,
  };
}

function normalizeCouncilSealArray(value: unknown): CouncilSeal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const claim = normalizeClaimObject(item.claim);
    const seal = isRecord(item.seal) ? item.seal : item;
    const endorsers = arrayField(seal.endorsingCouncillors ?? seal.endorsing_councillors).filter(isRetrievingCouncillorId);
    if (!claim) return [];
    const level = seal.level === "probable" || seal.level === "contested" ? seal.level : "council_endorsed";
    return [{
      seal_id: stringField(item.seal_id) || `${claim.claim_id}-${level}`,
      claim,
      level,
      endorsing_councillors: endorsers,
      support_count: typeof item.support_count === "number" ? item.support_count : endorsers.length,
      supporting_claim_ids: arrayField(item.supporting_claim_ids).filter(isString),
    }];
  });
}

function normalizeCouncilDisputeArray(value: unknown): CouncilDispute[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const claimA = normalizeClaimObject(item.claimA ?? item.claim_a);
    const claimB = normalizeClaimObject(item.claimB ?? item.claim_b);
    if (!claimA || !claimB) return [];
    const conflictType = item.conflictType === "scope_disagreement" || item.conflictType === "evidence_conflict"
      ? item.conflictType
      : item.conflict_type === "scope_disagreement" || item.conflict_type === "evidence_conflict"
        ? item.conflict_type
        : "direct_contradiction";
    return [{
      dispute_id: stringField(item.dispute_id) || `${claimA.claim_id}-${claimB.claim_id}`,
      claim_a: claimA,
      claim_b: claimB,
      conflict_type: conflictType,
      summary: stringField(item.summary),
      councillors: arrayField(item.councillors).filter(isRetrievingCouncillorId),
    }];
  });
}

function normalizeCouncilVerdict(value: unknown): CouncilVerdict | null {
  if (!isRecord(value)) return null;
  const clash = isRecord(value.clashMatrix) ? value.clashMatrix : isRecord(value.clash_matrix) ? value.clash_matrix : {};
  return {
    strategic_position: stringField(value.strategicPosition ?? value.strategic_position),
    top_arguments: arrayField(value.topArguments ?? value.top_arguments).map((item) => ({
      argument: isRecord(item) ? stringField(item.argument) : String(item),
      strength: isRecord(item) && item.strength === "moderate" ? "moderate" : "strong",
    })),
    top_vulnerabilities: arrayField(value.topVulnerabilities ?? value.top_vulnerabilities).map((item) => ({
      vulnerability: isRecord(item) ? stringField(item.vulnerability) : String(item),
      severity: isRecord(item) && item.severity === "medium" ? "medium" : "high",
    })),
    recommended_speech_strategy: stringField(value.recommendedSpeechStrategy ?? value.recommended_speech_strategy),
    opening_speech_variants: arrayField(value.openingSpeechVariants ?? value.opening_speech_variants).map((item) => ({
      style: isRecord(item) && (item.style === "aggressive" || item.style === "rhetorical") ? item.style : "measured",
      text: isRecord(item) ? stringField(item.text) : String(item),
    })),
    poi_bank: arrayField(value.poiBank ?? value.poi_bank).map((item) => {
      const target = isRecord(item) ? stringField(item.targetCouncillor ?? item.target_councillor) : "";
      return {
      poi: isRecord(item) ? stringField(item.poi) : String(item),
      timing_cue: isRecord(item) ? stringField(item.timingCue ?? item.timing_cue) : "",
      target_councillor: target || undefined,
      };
    }),
    clash_matrix: {
      government_args: arrayField(clash.governmentArgs ?? clash.government_args).filter(isString),
      opposition_args: arrayField(clash.oppositionArgs ?? clash.opposition_args).filter(isString),
      crossfire_points: arrayField(clash.crossfirePoints ?? clash.crossfire_points).filter(isString),
    },
  };
}

function isClaimObject(value: unknown): value is ClaimObject {
  return isRecord(value)
    && typeof value.claim_id === "string"
    && typeof value.text === "string"
    && (isRetrievingCouncillorId(value.councillor_id) || value.councillor_id === "C7_CHIEF");
}

function normalizeClaimObject(value: unknown): ClaimObject | null {
  if (!isRecord(value)) return null;
  const councillorId = value.councillorId ?? value.councillor_id;
  if (!isRetrievingCouncillorId(councillorId) && councillorId !== "C7_CHIEF") return null;
  const position = value.position ?? value.stance;
  const stance = position === "challenge" || position === "challenges"
    ? "challenges"
    : position === "neutral"
      ? "neutral"
      : "supports";
  return {
    claim_id: stringField(value.claimId ?? value.claim_id) || "claim-unknown",
    text: stringField(value.text),
    source_ids: arrayField(value.sourceIds ?? value.source_ids).filter(isString),
    councillor_id: councillorId,
    confidence: value.confidence === "high" || value.confidence === "low" ? value.confidence : "medium",
    stance,
    tags: arrayField(value.tags).filter(isString),
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
