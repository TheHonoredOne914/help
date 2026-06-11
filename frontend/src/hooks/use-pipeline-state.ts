import { useReducer, useCallback } from "react";
import type { VerificationResult, ExhaustedState } from "@/components/chat/research-pipeline";
import { getRunStatusSemantics } from "@/lib/run-state/status-semantics";
import {
  type CouncilDispute,
  type CouncilSeal,
  type CouncilSession,
  type CouncilVerdict,
  type CouncillorOutput,
  type RetrievingCouncillorId,
} from "@/components/council/council-types";

export type DimensionClass = "core" | "secondary" | "tertiary";

export interface DimensionScore {
  name: string;
  class: DimensionClass;
  rawScore: number;
  boostedScore: number;
  priority: "primary" | "secondary" | "background";
  triggerKeywords: string[];
}

export interface EvidenceRegistrySummary {
  totalSources: number;
  tierCounts: Record<string, number>;
  courtJudgementCount: number;
  snippetOnlyCount: number;
  evidenceGaps: string[];
}

export interface FoundResult {
  title: string;
  url: string;
  engine?: string;
  sourceType?: string;
}

export interface FullSourceManifestSource {
  index: number;
  title: string;
  url: string;
  badge: string;
  sourceType: string;
  score: number;
  hasFullContent: boolean;
  contentPreview: string;
  reportType?: string;
  judgement?: {
    caseName: string;
    year: string;
    court: string;
    held?: string;
  } | null;
}

export interface FullSourceManifestSummary {
  totalSources: number;
  sources: FullSourceManifestSource[];
}

export interface DataCheatsheet {
  query:       string;
  numbers:     string[];
  percentages: string[];
  judgements:  Array<{ caseName: string; year: string; court: string; held: string }>;
  govReports:  string[];
  topSources:  Array<{ title: string; url: string; sourceType?: string }>;
}

export interface BatchState {
  batchName:   string;
  role:        "data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs" | "media_journalist";
  models:      string[];
  status:      "waiting" | "active" | "complete";
  findings:    string[];
  numbers:     string[];
  percentages: string[];
  judgements:  Array<{ caseName: string; year: string; court: string; held: string }>;
  govReports:  string[];
}

export interface PlannerRoles {
  data_analyst: string[];
  legal_researcher: string[];
  policy_analyst: string[];
  current_affairs: string[];
  media_journalist?: string[];
}

export interface CorePipelineEventSummary {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface SourceContractStatus {
  requiredEvidenceCardsPerModel: number;
  requiredUniqueCitedSources: number;
  citationEligibleSources: number;
  roles: Array<{
    roleName: string;
    sourceCountUsed: number;
    passed: boolean;
    sourceGapReason?: string;
  }>;
}

export interface SourceGapReportSummary {
  requiredUniqueSources: number;
  availableCitationEligibleSources: number;
  failedBuckets: string[];
  weakBuckets: string[];
  explanation: string;
}

export interface CoreQualityGateStatus {
  passed: boolean;
  score: number;
  repairRequired?: boolean;
  automaticFailures: string[];
  warnings: string[];
}

export type ResearchModeStatus = "fast_research" | "deep_research" | "council";
export type ModelDraftStatus = "drafting" | "complete";
export type PipelineRunStatus =
  | "idle"
  | "running"
  | "repairing"
  | "completed"
  | "completed_with_source_gaps"
  | "degraded_fallback"
  | "failed"
  | "cancelled"
  | "provider_error"
  | "legacy_fallback_used";

export type PipelineStatusSeverity = "success" | "warning" | "error" | "info";

export interface PipelineTerminalStatusSemantics {
  isTerminal: boolean;
  isSuccessful: boolean;
  severity: PipelineStatusSeverity;
  label: string;
}

export function getPipelineTerminalStatusSemantics(status: PipelineRunStatus): PipelineTerminalStatusSemantics {
  switch (status) {
    case "completed":
      return { isTerminal: true, isSuccessful: true, severity: "success", label: "Research Complete" };
    case "completed_with_source_gaps":
      return { isTerminal: true, isSuccessful: false, severity: "warning", label: "Completed With Source Gaps" };
    case "legacy_fallback_used":
      return { isTerminal: true, isSuccessful: false, severity: "warning", label: "Legacy Fallback Used" };
    case "degraded_fallback":
      return { isTerminal: true, isSuccessful: false, severity: "warning", label: "Degraded Fallback" };
    case "provider_error":
      return { isTerminal: true, isSuccessful: false, severity: "error", label: "Provider Error" };
    case "failed":
      return { isTerminal: true, isSuccessful: false, severity: "error", label: "Research Failed" };
    case "cancelled":
      return { isTerminal: true, isSuccessful: false, severity: "info", label: "Research Cancelled" };
    default:
      return { isTerminal: false, isSuccessful: false, severity: "info", label: "Research Running" };
  }
}

export interface CitationStatusSummary {
  finalUniqueCitedSources: number;
  totalLinkedCitations: number;
  citedSourceIds: number[];
  citationCoverage: number;
  invalidCitations?: string[];
  rejectedCitations?: string[];
  citedBuckets?: string[];
  missingSourceBuckets?: string[];
}

export interface ArchiveRoutingStatus {
  relationType: "core_related" | "subtopic_related" | "temporary_side_query" | "unrelated";
  confidence: number;
  suggestedAction: "attach_to_workspace" | "create_subthread" | "temporary_isolated_response" | "new_workspace";
  overlapReasons: string[];
  driftRisks: string[];
  shouldAskUser: boolean;
}

export interface ResearchAngleStatus {
  id: string;
  title: string;
  whyItMatters: string;
  parliamentaryUse: string;
  bestSide: "treasury" | "opposition" | "both" | "neutral";
  sourceBucketsNeeded: string[];
  likelyArguments: string[];
  likelyCounters: string[];
  suggestedPOIs: string[];
}

export interface PipelineRunState {
  runId: string;
  conversationId: string | number | null;
  assistantMessageId: string | number | null;
  queryHash: string | null;
  researchMode: ResearchModeStatus | null;
  streamingContent: string;
  sourceRegistry: FullSourceManifestSummary | EvidenceRegistrySummary | null;
  citationStatus: CitationStatusSummary | null;
  sourceContract: SourceContractStatus | null;
  sourceGapReport: SourceGapReportSummary | null;
  qualityGate: CoreQualityGateStatus | null;
  corePipelineEvents: CorePipelineEventSummary[];
  divisionOutputs: Record<string, string>;
  councilSession: CouncilSession | null;
  legacyFallbackUsed: boolean;
  status: PipelineRunStatus;
}

export interface PipelineState {
  activeRunIdByConversationId: Record<string, string>;
  runs: Record<string, PipelineRunState>;
  activeRunId: string | null;
  activeAssistantMessageId: number | string | null;
  activeConversationId: number | string | null;
  ignoredStaleEventsCount: number;
  answerDraftByAssistantMessageId: Record<string, string>;
  streamingContent: string;
  currentSearch: string | null;
  plannerModel: string | null;
  isPlanning: boolean;
  batches: Record<string, BatchState>;

  customModelSearches: Record<string, string[]>;
  customModelFound: Record<string, FoundResult[]>;
  customModelExhausted: Record<string, ExhaustedState | null>;
  modelDraftStatus: Record<string, ModelDraftStatus>;
  queriesPlannedByModel: Record<string, number>;

  isSynthesizing: boolean;
  isVerifying: boolean;
  verification: VerificationResult | null;
  isComplete: boolean;

  qwenThinking: string[];
  qwenThinkingStream: string;

  isDiscussing: boolean;
  discussion: string | null;

  bothExhausted: boolean;

  fallbackModel: string | null;

  researchPlan: string[];
  plannerRoles: PlannerRoles | null;

  fetchingTotal: number;
  fetchedCount: number;
  citationWarning: boolean;
  citationWarningCount: number;
  topicStrategy: { topicClass: string; sourcePriorities: string[]; mustIncludeDomains: string[] } | null;
  isGeminiSynthesizing: boolean;
  citationCoverage: { coveragePct: number; missingIds: number[]; eligibleIds: number[] } | null;
  citedNums: Set<number>;

  dataCheatsheet: DataCheatsheet | null;
  dimensionScores: DimensionScore[] | null;
  divisionProgress: { current: number; total: number; percentage: number } | null;
  activeDivisions: string[];
  completedDivisions: Array<{ id: string; wordCount: number; citationCount: number }>;
  divisionOutputs: Record<string, string>;
  agendaClass: string | null;
  committeeType: string | null;
  evidenceSummary: EvidenceRegistrySummary | null;
  fullSourceManifest: FullSourceManifestSummary | null;
  corePipelineEvents: CorePipelineEventSummary[];
  sourceContract: SourceContractStatus | null;
  sourceGapReport: SourceGapReportSummary | null;
  coreQualityGate: CoreQualityGateStatus | null;
  citationStatus: CitationStatusSummary | null;
  councilSession: CouncilSession | null;
  runStatus: PipelineRunStatus;
  selectedResearchMode: ResearchModeStatus | null;
  archiveRouting: ArchiveRoutingStatus | null;
  researchAngles: ResearchAngleStatus[];
  legacyFallbackUsed: boolean;

  // Backend may auto-add worker models (min-2 policy). This overrides the UI-selected list for the live run.
  effectiveModels: string[] | null;
}

export const initialPipelineState: PipelineState = {
  activeRunIdByConversationId: {},
  runs: {},
  activeRunId: null,
  activeAssistantMessageId: null,
  activeConversationId: null,
  ignoredStaleEventsCount: 0,
  answerDraftByAssistantMessageId: {},
  streamingContent: "",
  currentSearch: null,
  plannerModel: null,
  isPlanning: false,
  batches: {},
  customModelSearches: {},
  customModelFound: {},
  customModelExhausted: {},
  modelDraftStatus: {},
  queriesPlannedByModel: {},
  isSynthesizing: false,
  isVerifying: false,
  verification: null,
  isComplete: false,
  qwenThinking: [],
  qwenThinkingStream: "",
  isDiscussing: false,
  discussion: null,
  bothExhausted: false,
  fallbackModel: null,
  researchPlan: [],
  plannerRoles: null,
  fetchingTotal: 0,
  fetchedCount: 0,
  citationWarning: false,
  citationWarningCount: 0,
  topicStrategy: null,
  isGeminiSynthesizing: false,
  citationCoverage: null,
  citedNums: new Set<number>(),
  dataCheatsheet: null,
  dimensionScores: null,
  divisionProgress: null,
  activeDivisions: [],
  completedDivisions: [],
  divisionOutputs: {},
  agendaClass: null,
  committeeType: null,
  evidenceSummary: null,
  fullSourceManifest: null,
  corePipelineEvents: [],
  sourceContract: null,
  sourceGapReport: null,
  coreQualityGate: null,
  citationStatus: null,
  councilSession: null,
  runStatus: "idle",
  selectedResearchMode: null,
  archiveRouting: null,
  researchAngles: [],
  legacyFallbackUsed: false,
  effectiveModels: null,
};

export type PipelineAction =
  | { type: "RESET" }
  | { type: "SET_ACTIVE_RUN"; runId: string; assistantMessageId?: number | string | null; conversationId?: number | string | null }
  | { type: "IGNORED_STALE_EVENT" }
  | { type: "RUN_STATUS"; status: PipelineRunStatus }
  | { type: "EFFECTIVE_MODELS"; models: string[] }
  | { type: "PLANNING"; plannerModel: string | null }
  | { type: "SEARCHING"; model: string; query: string }
  | { type: "QUERIES_PLANNED"; model: string; count: number }
  | { type: "FOUND"; model: string; results: FoundResult[] }
  | { type: "DISCUSSING" }
  | { type: "DISCUSSION"; text: string }
  | { type: "SYNTHESIZING" }
  | { type: "VERIFYING" }
  | { type: "VERIFIED"; verification: VerificationResult }
  | { type: "QWEN_THINKING"; text: string }
  | { type: "QWEN_THINKING_CHUNK"; chunk: string }
  | { type: "MODEL_EXHAUSTED"; key: string; reason: string }
  | { type: "BOTH_EXHAUSTED" }
  | { type: "FALLBACK"; model: string }
  | { type: "CONTENT"; chunk: string }
  | { type: "COMPLETE" }
  | { type: "CLEAR_CURRENT_SEARCH" }
  | { type: "RESEARCH_PLAN"; subQueries: string[] }
  | { type: "PLANNER_ROLES"; plannerRoles: PlannerRoles }
  | { type: "FETCHING"; total: number }
  | { type: "FETCHED"; i: number; total: number; url: string }
  | { type: "CITATION_WARNING"; count: number }
  | { type: "TOPIC_STRATEGY"; strategy: { topicClass: string; sourcePriorities: string[]; mustIncludeDomains: string[] } }
  | { type: "GEMINI_SYNTHESIZING" }
  | { type: "CITATION_COVERAGE"; coverage: { coveragePct: number; missingIds: number[]; eligibleIds: number[] } }
  | { type: "CORE_PIPELINE_EVENT"; event: CorePipelineEventSummary }
  | { type: "SOURCE_CONTRACT"; contract: SourceContractStatus }
  | { type: "SOURCE_GAP_REPORT"; report: SourceGapReportSummary }
  | { type: "CORE_QUALITY_GATE"; gate: CoreQualityGateStatus }
  | { type: "CITATION_STATUS"; status: CitationStatusSummary }
  | { type: "SELECTED_RESEARCH_MODE"; mode: ResearchModeStatus }
  | { type: "COUNCIL_C_STARTED"; councillorId: RetrievingCouncillorId; title: string }
  | { type: "COUNCIL_C_CHUNK"; councillorId: RetrievingCouncillorId; chunk: string }
  | { type: "COUNCIL_C_COMPLETE"; councillor: CouncillorOutput }
  | { type: "DELIBERATION_UPDATE"; seals: CouncilSeal[]; disputes: CouncilDispute[]; agreementScore: number }
  | { type: "CHIEF_VERDICT_CHUNK"; chunk: string }
  | { type: "CHIEF_VERDICT_COMPLETE"; verdict: CouncilVerdict | null }
  | { type: "ARCHIVE_ROUTING"; routing: ArchiveRoutingStatus }
  | { type: "RESEARCH_ANGLES"; angles: ResearchAngleStatus[] }
  | { type: "LEGACY_FALLBACK_USED"; used: boolean }
  | { type: "SET_CITED_NUMS"; citedNums: Set<number> }
  | { type: "DRAFTING"; model: string }
  | { type: "DRAFT_COMPLETE"; model: string }
  | { type: "DIMENSION_SCORES"; scores: DimensionScore[] }
  | { type: "DIVISION_PROGRESS"; current: number; total: number }
  | { type: "DIVISION_STARTED"; division: string; dimensionClass: "primary" | "secondary" }
  | { type: "DIVISION_COMPLETE"; division: string; wordCount: number; citationCount: number }
  | { type: "DIVISION_OUTPUTS"; outputs: Record<string, string> }
  | { type: "EVIDENCE_REGISTRY"; registry: EvidenceRegistrySummary }
  | { type: "FULL_SOURCE_MANIFEST"; manifest: FullSourceManifestSummary }
  | { type: "AGENDA_CLASS"; agendaClass: string; committeeType: string }
  | { type: "BATCH_START"; batchName: string; role: "data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs" | "media_journalist"; models: string[] }
  | {
      type: "BATCH_COMPLETE";
      batchName:   string;
      role:        "data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs" | "media_journalist";
      findings:    string[];
      numbers:     string[];
      percentages: string[];
      judgements:  Array<{ caseName: string; year: string; court: string; held: string }>;
      govReports:  string[];
    }
  | { type: "DATA_CHEATSHEET"; cheatsheet: DataCheatsheet };

function createRunState(
  runId: string,
  conversationId: number | string | null,
  assistantMessageId: number | string | null,
  existing?: PipelineRunState,
): PipelineRunState {
  return existing ?? {
    runId,
    conversationId,
    assistantMessageId,
    queryHash: null,
    researchMode: null,
    streamingContent: "",
    sourceRegistry: null,
    citationStatus: null,
    sourceContract: null,
    sourceGapReport: null,
    qualityGate: null,
    corePipelineEvents: [],
    divisionOutputs: {},
    councilSession: null,
    legacyFallbackUsed: false,
    status: "running",
  };
}

function updateActiveRun(state: PipelineState, update: (run: PipelineRunState) => PipelineRunState): PipelineState {
  if (!state.activeRunId) return state;
  const existing = state.runs[state.activeRunId] ?? createRunState(state.activeRunId, state.activeConversationId, state.activeAssistantMessageId);
  const nextRun = update(existing);
  return {
    ...state,
    runs: {
      ...state.runs,
      [nextRun.runId]: nextRun,
    },
  };
}

function createEmptyCouncilSession(): CouncilSession {
  return {
    session_id: "",
    topic: "",
    stance: "independent",
    status: "briefing",
    terminalStatus: "completed",
    councillors: {
      C1_LEGAL: null,
      C2_ECONOMIC: null,
      C3_STRATEGIC: null,
      C4_SOCIAL: null,
      C5_HISTORICAL: null,
      C6_OPPOSITION: null,
    },
    seals: [],
    disputes: [],
    agreement_score: 0,
    chief_verdict_stream: "",
    verdict: null,
    created_at: new Date().toISOString(),
  };
}

function updateCouncilSession(state: PipelineState, update: (session: CouncilSession) => CouncilSession): PipelineState {
  const existing = state.activeRunId ? state.runs[state.activeRunId]?.councilSession : state.councilSession;
  const nextSession = update(existing ?? state.councilSession ?? createEmptyCouncilSession());
  return {
    ...updateActiveRun(state, (run) => ({ ...run, councilSession: nextSession })),
    councilSession: nextSession,
  };
}

function createRunningCouncillor(councillorId: RetrievingCouncillorId, title: string): CouncillorOutput {
  return {
    councillor_id: councillorId,
    title,
    perspective: "",
    status: "running",
    summary: "",
    raw_brief: "",
    key_claims: [],
    sources_used: [],
    evidence_pack_ids: [],
    started_at: new Date().toISOString(),
  };
}

export function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case "RESET":
      return { ...initialPipelineState, citedNums: new Set<number>() };

    case "SET_ACTIVE_RUN": {
      const conversationKey = action.conversationId == null ? null : String(action.conversationId);
      const nextRun = createRunState(
        action.runId,
        action.conversationId ?? null,
        action.assistantMessageId ?? null,
        state.runs[action.runId],
      );
      nextRun.assistantMessageId = action.assistantMessageId ?? nextRun.assistantMessageId;
      nextRun.conversationId = action.conversationId ?? nextRun.conversationId;
      nextRun.status = "running";
      return {
        ...state,
        activeRunIdByConversationId: conversationKey
          ? { ...state.activeRunIdByConversationId, [conversationKey]: action.runId }
          : state.activeRunIdByConversationId,
        runs: {
          ...state.runs,
          [action.runId]: nextRun,
        },
        activeRunId: action.runId,
        activeAssistantMessageId: action.assistantMessageId ?? null,
        activeConversationId: action.conversationId ?? null,
        streamingContent: "",
        runStatus: "running",
        // Reset core pipeline events on new run to prevent stale events from showing
        corePipelineEvents: [],
      };
    }

    case "IGNORED_STALE_EVENT":
      return { ...state, ignoredStaleEventsCount: state.ignoredStaleEventsCount + 1 };

    case "RUN_STATUS":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, status: action.status })),
        runStatus: action.status,
        isComplete: getRunStatusSemantics(action.status).isSuccessful,
      };

    case "EFFECTIVE_MODELS":
      return { ...state, effectiveModels: action.models };

    case "PLANNING":
      return {
        ...state,
        plannerModel: action.plannerModel,
        isPlanning: true,
        currentSearch: null,
      };

    case "SEARCHING": {
      const { model, query } = action;
      const cur = state.customModelSearches[model] ?? [];
      return {
        ...state,
        isPlanning: false,
        currentSearch: query,
        customModelSearches: {
          ...state.customModelSearches,
          [model]: cur.includes(query) ? cur : [...cur, query],
        },
      };
    }

    case "QUERIES_PLANNED": {
      const count = Math.max(1, Math.trunc(action.count));
      return {
        ...state,
        queriesPlannedByModel: {
          ...state.queriesPlannedByModel,
          [action.model]: count,
        },
      };
    }

    case "FOUND": {
      const { model, results } = action;
      const existing = state.customModelFound[model] ?? [];
      const seen = new Set(existing.map((result) => result.url));
      const dedupedResults = results.filter((result) => {
        if (!result.url || seen.has(result.url)) return false;
        seen.add(result.url);
        return true;
      });
      return {
        ...state,
        customModelFound: {
          ...state.customModelFound,
          [model]: [...existing, ...dedupedResults],
        },
      };
    }

    case "DISCUSSING":
      return { ...state, isDiscussing: true, isPlanning: false, currentSearch: null };
    case "DISCUSSION":
      return { ...state, discussion: action.text, isDiscussing: false };
    case "SYNTHESIZING":
      return { ...state, isSynthesizing: true, isDiscussing: false, isPlanning: false, currentSearch: null };
    case "VERIFYING":
      return { ...state, isVerifying: true, isSynthesizing: false, isPlanning: false };
    case "VERIFIED":
      return { ...state, isVerifying: false, verification: action.verification };

    case "QWEN_THINKING":
      return { ...state, qwenThinking: [...state.qwenThinking, action.text] };
    case "QWEN_THINKING_CHUNK":
      return { ...state, qwenThinkingStream: state.qwenThinkingStream + action.chunk };

    case "MODEL_EXHAUSTED": {
      const ex: ExhaustedState = { reason: action.reason as ExhaustedState["reason"] };
      return {
        ...state,
        customModelExhausted: {
          ...state.customModelExhausted,
          [action.key]: ex,
        },
      };
    }
    case "BOTH_EXHAUSTED":
      return { ...state, bothExhausted: true };

    case "FALLBACK":
      return { ...state, fallbackModel: action.model };

    case "CONTENT": {
      const currentRunText = state.activeRunId
        ? state.runs[state.activeRunId]?.streamingContent ?? state.streamingContent
        : state.streamingContent;
      const nextState = updateActiveRun(state, (run) => ({ ...run, streamingContent: run.streamingContent + action.chunk }));
      return {
        ...nextState,
        currentSearch: null,
        isPlanning: false,
        isSynthesizing: false,
        streamingContent: currentRunText + action.chunk,
        answerDraftByAssistantMessageId: state.activeAssistantMessageId == null ? state.answerDraftByAssistantMessageId : {
          ...state.answerDraftByAssistantMessageId,
          [String(state.activeAssistantMessageId)]: (state.answerDraftByAssistantMessageId[String(state.activeAssistantMessageId)] ?? "") + action.chunk,
        },
      };
    }

    case "COMPLETE": {
      const semantics = getRunStatusSemantics(state.runStatus);
      return {
        ...updateActiveRun(state, (run) => ({ ...run, status: state.runStatus })),
        isComplete: semantics.isSuccessful,
        runStatus: state.runStatus,
      };
    }

    case "CLEAR_CURRENT_SEARCH":
      return { ...state, currentSearch: null };

    case "RESEARCH_PLAN":
      return { ...state, researchPlan: action.subQueries };

    case "PLANNER_ROLES":
      return { ...state, plannerRoles: action.plannerRoles };

    case "FETCHING": {
      const total = Math.max(0, Math.trunc(action.total));
      return { ...state, fetchingTotal: total, fetchedCount: 0 };
    }
    case "FETCHED": {
      const total = Math.max(state.fetchingTotal, Math.max(0, Math.trunc(action.total || 0)));
      const fetchedCount = Math.min(total || state.fetchedCount, Math.max(state.fetchedCount, Math.trunc(action.i) + 1));
      return { ...state, fetchingTotal: total, fetchedCount };
    }
    case "CITATION_WARNING":
      return { ...state, citationWarning: true, citationWarningCount: Math.max(state.citationWarningCount, Math.max(0, action.count)) };

    case "TOPIC_STRATEGY":
      return { ...state, topicStrategy: action.strategy };

    case "GEMINI_SYNTHESIZING":
      return { ...state, isGeminiSynthesizing: true };

    case "CITATION_COVERAGE":
      return { ...state, citationCoverage: action.coverage };

    case "CORE_PIPELINE_EVENT":
      return {
        ...updateActiveRun(state, (run) => ({
          ...run,
          corePipelineEvents: [...run.corePipelineEvents.slice(-11), action.event],
        })),
        corePipelineEvents: [...state.corePipelineEvents.slice(-11), action.event],
      };

    case "SOURCE_CONTRACT":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, sourceContract: action.contract })),
        sourceContract: action.contract,
      };

    case "SOURCE_GAP_REPORT":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, sourceGapReport: action.report })),
        sourceGapReport: action.report,
      };

    case "CORE_QUALITY_GATE":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, qualityGate: action.gate })),
        coreQualityGate: action.gate,
      };

    case "CITATION_STATUS":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, citationStatus: action.status })),
        citationStatus: action.status,
      };

    case "SELECTED_RESEARCH_MODE":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, researchMode: action.mode })),
        selectedResearchMode: action.mode,
      };

    case "COUNCIL_C_STARTED":
      return updateCouncilSession(state, (session) => ({
        ...session,
        status: "briefing",
        councillors: {
          ...session.councillors,
          [action.councillorId]: createRunningCouncillor(action.councillorId, action.title),
        },
      }));

    case "COUNCIL_C_CHUNK":
      return updateCouncilSession(state, (session) => {
        const current = session.councillors[action.councillorId] ?? createRunningCouncillor(action.councillorId, action.councillorId);
        return {
          ...session,
          councillors: {
            ...session.councillors,
            [action.councillorId]: {
              ...current,
              status: current.status === "pending" ? "running" : current.status,
              raw_brief: `${current.raw_brief}${action.chunk}`,
            },
          },
        };
      });

    case "COUNCIL_C_COMPLETE":
      return updateCouncilSession(state, (session) => ({
        ...session,
        councillors: {
          ...session.councillors,
          [action.councillor.councillor_id]: action.councillor,
        },
      }));

    case "DELIBERATION_UPDATE":
      return updateCouncilSession(state, (session) => ({
        ...session,
        status: "deliberating",
        seals: action.seals,
        disputes: action.disputes,
        agreement_score: action.agreementScore,
      }));

    case "CHIEF_VERDICT_CHUNK":
      return updateCouncilSession(state, (session) => ({
        ...session,
        status: "synthesizing",
        chief_verdict_stream: `${session.chief_verdict_stream}${action.chunk}`,
        verdict: session.verdict,
      }));

    case "CHIEF_VERDICT_COMPLETE":
      return updateCouncilSession(state, (session) => ({
        ...session,
        status: "complete",
        verdict: action.verdict,
        completed_at: new Date().toISOString(),
      }));

    case "ARCHIVE_ROUTING":
      return { ...state, archiveRouting: action.routing };

    case "RESEARCH_ANGLES":
      return { ...state, researchAngles: action.angles };

    case "LEGACY_FALLBACK_USED":
      // Fix (Bug L658): update BOTH the active run status AND top-level runStatus so the
      // sidebar, status badge, and persisted metadata all reflect the fallback state
      return {
        ...updateActiveRun(state, (run) => ({
          ...run,
          legacyFallbackUsed: action.used,
          // Only change status if it hasn't already been set to a more specific terminal value
          status: action.used && (run.status === "running" || run.status === "idle") ? "legacy_fallback_used" : run.status,
        })),
        legacyFallbackUsed: action.used,
        runStatus: action.used && (state.runStatus === "running" || state.runStatus === "idle") ? "legacy_fallback_used" : state.runStatus,
      };

    case "SET_CITED_NUMS":
      return { ...state, citedNums: action.citedNums };

    case "DRAFTING": {
      return {
        ...state,
        modelDraftStatus: {
          ...state.modelDraftStatus,
          [action.model]: "drafting",
        },
      };
    }

    case "DRAFT_COMPLETE":
      return {
        ...state,
        modelDraftStatus: {
          ...state.modelDraftStatus,
          [action.model]: "complete",
        },
      };

    case "DIMENSION_SCORES":
      return { ...state, dimensionScores: action.scores };

    case "DIVISION_PROGRESS": {
      const percentage = action.total > 0
        ? Math.round((action.current / action.total) * 100)
        : 0;
      return {
        ...state,
        divisionProgress: {
          current: action.current,
          total: action.total,
          percentage,
        },
      };
    }

    case "AGENDA_CLASS":
      return { ...state, agendaClass: action.agendaClass, committeeType: action.committeeType };

    case "DIVISION_STARTED":
      return {
        ...state,
        activeDivisions: state.activeDivisions.includes(action.division)
          ? state.activeDivisions
          : [...state.activeDivisions, action.division],
      };

    case "DIVISION_COMPLETE":
      return {
        ...state,
        activeDivisions: state.activeDivisions.filter((division) => division !== action.division),
        completedDivisions: [
          ...state.completedDivisions.filter((division) => division.id !== action.division),
          { id: action.division, wordCount: action.wordCount, citationCount: action.citationCount },
        ],
      };

    case "DIVISION_OUTPUTS":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, divisionOutputs: action.outputs })),
        divisionOutputs: action.outputs,
      };

    case "EVIDENCE_REGISTRY":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, sourceRegistry: action.registry })),
        evidenceSummary: action.registry,
      };

    case "FULL_SOURCE_MANIFEST":
      return {
        ...updateActiveRun(state, (run) => ({ ...run, sourceRegistry: action.manifest })),
        fullSourceManifest: action.manifest,
      };

    case "BATCH_START": {
      const nb: BatchState = {
        batchName: action.batchName,
        role: action.role,
        models: action.models,
        status: "active",
        findings: [],
        numbers: [],
        percentages: [],
        judgements: [],
        govReports: [],
      };
      return { ...state, batches: { ...state.batches, [action.batchName]: nb } };
    }

    case "BATCH_COMPLETE": {
      const ex = state.batches[action.batchName];
      return {
        ...state,
        batches: {
          ...state.batches,
          [action.batchName]: {
            ...(ex ?? {
              batchName: action.batchName,
              role: action.role,
              models: [],
              status: "complete",
              findings: [],
              numbers: [],
              percentages: [],
              judgements: [],
              govReports: [],
            }),
            status:      "complete",
            findings:    action.findings,
            numbers:     action.numbers,
            percentages: action.percentages,
            judgements:  action.judgements,
            govReports:  action.govReports,
          },
        },
      };
    }

    case "DATA_CHEATSHEET":
      return { ...state, dataCheatsheet: action.cheatsheet };

    default:
      return state;
  }
}

export function usePipelineState() {
  const [state, dispatch] = useReducer(pipelineReducer, initialPipelineState);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  return { state, dispatch, reset };
}
