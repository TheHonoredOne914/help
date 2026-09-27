import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";

import {
  createMessage,
  updateMessage,
  getArchiveById,
  getArchiveContext,
  getConversationById,
  getMessagesByConversationId,
} from "../../db.js";
import { composeAnthropicSystemPrompt } from "../../lib/chat-system-prompt.js";
import { parseProviderModelId } from "../../lib/provider-router.js";
import { getRequestOwnerId } from "../../lib/request-auth.js";
import { detectFreshnessNeeded } from "../../core/freshness/freshness-router.js";
import type { ResearchRunIdentity } from "../../core/pipeline/pipeline-events.js";
import type { ResearchMode } from "../../core/config/research-mode.js";
import {
  isResearchRouteMode,
  normalizeEffectiveResearchMode,
  queryHashFor,
} from "./pipeline-types.js";
import { capUserSystemPrompt, resolveRouteMode } from "./message-route-mode.js";

export const SendAnthropicMessageParams = z.object({ id: z.number().int().positive() });
export const ResearchModeSchema = z.enum(["fast_research", "deep_research", "council"]);
export const SendAnthropicMessageBody = z.object({
  content: z.string().min(1),
  mode: z.enum(["normal", "web_search", "deep_research", "rhetorics", "drafting", "fast_research", "council"]).optional(),
  researchMode: ResearchModeSchema.optional(),
  rhetoricsType: z.enum(["kavita", "speech", "debate"]).optional(),
  creativity: z.number().min(0).max(1).optional(),
});

import { DEFAULT_GROQ_MODEL, GROQ_LIVE_FALLBACK_NATIVE, remapUnavailableGroqModelId } from "../../core/providers/catalog/index.js";
export { DEFAULT_GROQ_MODEL, GROQ_LIVE_FALLBACK_NATIVE, remapUnavailableGroqModelId };

export function groqNativeModelFromRequest(raw?: string | null): string {
  const id = (raw ?? "").trim();
  const native = id.startsWith("groq/")
    ? id.slice("groq/".length)
    : id && !id.includes("/")
      ? id
      : GROQ_LIVE_FALLBACK_NATIVE;
  return remapUnavailableGroqModelId(native || GROQ_LIVE_FALLBACK_NATIVE);
}

const TIMEOUT_CONFIG = {
  normal: 2 * 60 * 1000,
  // web_search resolves to fast_research internally; stream allowance matches 90s latency budget (+5s buffer).
  web_search: 95 * 1000,
  deep_research: 250 * 1000,
  fast_research: 95 * 1000,
  council: 30 * 60 * 1000,
  rhetorics: 5 * 60 * 1000,
  drafting: 5 * 60 * 1000,
} as const;

export interface MessageRouteContext {
  conversationId: number;
  ownerUserId: string;
  userContent: string;
  mode: string;
  freshnessDecision: ReturnType<typeof detectFreshnessNeeded>;
  freshnessResearchMode: ResearchMode | null;
  routeMode: string;
  effectiveResearchMode: ResearchMode;
  selectedResearchMode?: ResearchMode;
  rhetoricsType: string | null;
  creativity: number;
  temperature: number;
  rawSystemPrompt: string;
  userSystemPrompt: string;
  combinedSystemPrompt: string;
  autoFallback: boolean;
  rawNormalModel: string;
  effectiveWebModels: string[];
  streamTimeoutMs: number;
  archiveId: number | null;
  archiveTopic: string;
  archiveSummary: string;
  userMessage?: { id: number };
  assistantMessage?: { id: number };
  runIdentity: ResearchRunIdentity;
  chatMessages: { role: "user" | "assistant"; content: string }[];
}

export type MessagePreflightResult =
  | { ok: false; status: number; body: Record<string, unknown> }
  | { ok: true; context: MessageRouteContext };

function invalidModelPrefixBody(): Record<string, unknown> {
  return {
    error: {
      code: "INVALID_MODEL_PREFIX",
      message: "Unrecognized model prefix. Expected groq/, openrouter/, nvidia/, gemini/, github/, ollama/, cerebras/, or opencode/.",
    },
  };
}

export function resolveStreamTimeoutMs(routeMode: string): number {
  return TIMEOUT_CONFIG[routeMode as keyof typeof TIMEOUT_CONFIG] ?? 5 * 60 * 1000;
}

export async function loadMessageRouteContext(
  req: Request,
  res: Response,
): Promise<MessagePreflightResult> {
  const rawContent = req.body?.content;
  if (typeof rawContent === "string" && rawContent.length > 32_768) {
    return { ok: false, status: 400, body: { error: "Message content exceeds 32KB limit.", code: "content_too_large" } };
  }

  const paramsParsed = SendAnthropicMessageParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = SendAnthropicMessageBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    return { ok: false, status: 400, body: { error: "Invalid request" } };
  }

  const conversationId = paramsParsed.data.id;
  const ownerUserId = getRequestOwnerId(req);
  const userContent = bodyParsed.data.content;
  const mode = bodyParsed.data.mode ?? "normal";
  const freshnessDecision = detectFreshnessNeeded(userContent, mode);
  // Freshness only annotates the run. It must not replace drafting or rhetorics with a research run.
  const freshnessResearchMode: ResearchMode | null = null;
  const routeMode = resolveRouteMode(mode);
  const effectiveResearchMode = normalizeEffectiveResearchMode(userContent, mode, bodyParsed.data.researchMode);
  const rhetoricsType = (bodyParsed.data.rhetoricsType ?? null) as string | null;
  const rawCreativity = bodyParsed.data.creativity;
  const creativity = typeof rawCreativity === "number" ? Math.max(0, Math.min(1, rawCreativity)) : 0.5;
  const temperature = 0.4 + creativity * 0.9;
  const rawSystemPrompt = capUserSystemPrompt(typeof req.body.systemPrompt === "string" ? req.body.systemPrompt : "");
  const userSystemPrompt = rawSystemPrompt;
  const autoFallback = req.body.autoFallback === true;
  const suppliedNormalModel = typeof req.body.normalModel === "string" ? req.body.normalModel.trim() : "";
  const rawNormalModel = remapUnavailableGroqModelId(suppliedNormalModel || DEFAULT_GROQ_MODEL);
  try {
    parseProviderModelId(rawNormalModel);
  } catch {
    return { ok: false, status: 400, body: invalidModelPrefixBody() };
  }

  const rawWebModels: string[] = [];
  if (Array.isArray(req.body.webModels)) {
    for (const model of req.body.webModels) {
      if (typeof model !== "string" || !model.trim()) continue;
      try {
        parseProviderModelId(model.trim());
        rawWebModels.push(remapUnavailableGroqModelId(model.trim()));
      } catch {
        return { ok: false, status: 400, body: invalidModelPrefixBody() };
      }
    }
  }
  const effectiveWebModels = rawWebModels.length > 0 ? rawWebModels : [rawNormalModel];
  const streamTimeoutMs = resolveStreamTimeoutMs(routeMode);

  try {
    const convo = await getConversationById(conversationId, ownerUserId);
    if (!convo) {
      return { ok: false, status: 404, body: { error: "Conversation not found" } };
    }
    const archiveId = convo.archive_id ?? null;
    const archive = archiveId ? await getArchiveById(archiveId, ownerUserId) : null;
    const archiveContext = archiveId ? await getArchiveContext(archiveId) : null;
    const archiveTopic = archive?.topic?.trim() || "";
    const archiveSummary = archiveContext?.summary?.trim() || "";
    const combinedSystemPrompt = composeAnthropicSystemPrompt({
      archiveTopic,
      archiveSummary,
      userSystemPrompt,
    });

    const regenerate = req.body?.regenerate === true;
    const priorMessages = regenerate ? await getMessagesByConversationId(conversationId) : [];
    const priorUser = [...priorMessages].reverse().find((message) => message.role === "user");
    const priorAssistant = [...priorMessages].reverse().find((message) => message.role === "assistant");
    const userMessage = regenerate && priorUser
      ? priorUser
      : await createMessage(conversationId, "user", userContent);
    const requestId = `req_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const runId = `run_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const waitingCopy = "Research run started. Waiting for streamed output...";
    const assistantMessage = isResearchRouteMode(routeMode)
      ? regenerate && priorAssistant
        ? await updateMessage(priorAssistant.id, {
            content: waitingCopy,
            runId,
            runStatus: "running",
          }) ?? priorAssistant
        : await createMessage(
            conversationId,
            "assistant",
            waitingCopy,
            null,
            runId,
            "running",
          )
      : regenerate && priorAssistant
        ? priorAssistant
        : undefined;
    const runIdentity: ResearchRunIdentity = {
      runId,
      requestId,
      conversationId,
      userMessageId: userMessage?.id,
      assistantMessageId: assistantMessage?.id,
      queryHash: queryHashFor(userContent),
      researchMode: effectiveResearchMode,
      archiveId: archiveId ?? undefined,
      createdAt: new Date().toISOString(),
    };

    const history = await getMessagesByConversationId(conversationId);
    const maxHistory = 20;
    const trimmedHistory = history.length > maxHistory
      ? history.slice(history.length - maxHistory)
      : history;

    return {
      ok: true,
      context: {
        conversationId,
        ownerUserId,
        userContent,
        mode,
        freshnessDecision,
        freshnessResearchMode,
        routeMode,
        effectiveResearchMode,
        selectedResearchMode: bodyParsed.data.researchMode,
        rhetoricsType,
        creativity,
        temperature,
        rawSystemPrompt,
        userSystemPrompt,
        combinedSystemPrompt,
        autoFallback,
        rawNormalModel,
        effectiveWebModels,
        streamTimeoutMs,
        archiveId,
        archiveTopic,
        archiveSummary,
        userMessage,
        assistantMessage,
        runIdentity,
        chatMessages: trimmedHistory.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      },
    };
  } catch (dbErr) {
    req.log?.error?.({ err: dbErr }, "Pre-flight DB error");
    void res;
    return { ok: false, status: 503, body: { error: "Database unavailable", code: "db_error" } };
  }
}
