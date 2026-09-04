import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";

import {
  createMessage,
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

export const SendAnthropicMessageParams = z.object({ id: z.number().int().positive() });
export const ResearchModeSchema = z.enum(["fast_research", "deep_research", "council"]);
export const SendAnthropicMessageBody = z.object({
  content: z.string().min(1),
  mode: z.enum(["normal", "web_search", "deep_research", "rhetorics", "drafting", "fast_research", "council"]).optional(),
  researchMode: ResearchModeSchema.optional(),
  rhetoricsType: z.enum(["kavita", "speech", "debate"]).optional(),
  creativity: z.number().min(0).max(1).optional(),
});

export const DEFAULT_GROQ_MODEL = "groq/llama-3.3-70b-versatile";

const TIMEOUT_CONFIG = {
  normal: 2 * 60 * 1000,
  web_search: 5 * 60 * 1000,
  deep_research: 15 * 60 * 1000,
  fast_research: 8 * 60 * 1000,
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
      message: "Unrecognized model prefix. Expected groq/, openrouter/, nvidia/, gemini/, github/, ollama/.",
    },
  };
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
  const freshnessResearchMode: ResearchMode | null =
    (mode === "normal" || mode === "rhetorics" || mode === "drafting") && freshnessDecision.needed
      ? "fast_research"
      : null;
  const routeMode = freshnessResearchMode ?? mode;
  const effectiveResearchMode = freshnessResearchMode ?? normalizeEffectiveResearchMode(userContent, mode, bodyParsed.data.researchMode);
  const rhetoricsType = (bodyParsed.data.rhetoricsType ?? null) as string | null;
  const rawCreativity = bodyParsed.data.creativity;
  const creativity = typeof rawCreativity === "number" ? Math.max(0, Math.min(1, rawCreativity)) : 0.5;
  const temperature = 0.4 + creativity * 0.9;
  const rawSystemPrompt = typeof req.body.systemPrompt === "string" ? req.body.systemPrompt : "";
  const userSystemPrompt = rawSystemPrompt.slice(0, 4000);
  const autoFallback = req.body.autoFallback === true;
  const suppliedNormalModel = typeof req.body.normalModel === "string" ? req.body.normalModel.trim() : "";
  const rawNormalModel = suppliedNormalModel || DEFAULT_GROQ_MODEL;
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
        rawWebModels.push(model.trim());
      } catch {
        return { ok: false, status: 400, body: invalidModelPrefixBody() };
      }
    }
  }
  const effectiveWebModels = rawWebModels.length > 0 ? rawWebModels : [rawNormalModel];
  const streamTimeoutMs = parseInt(process.env.STREAM_TIMEOUT_MS ?? "", 10)
    || TIMEOUT_CONFIG[routeMode as keyof typeof TIMEOUT_CONFIG]
    || 5 * 60 * 1000;

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
      userSystemPrompt: rawSystemPrompt,
    });

    const userMessage = await createMessage(conversationId, "user", userContent);
    const assistantMessage = isResearchRouteMode(routeMode)
      ? await createMessage(
          conversationId,
          "assistant",
          freshnessResearchMode
            ? "Freshness-sensitive research run started. Waiting for live-source output..."
            : "Research run started. Waiting for streamed output...",
        )
      : undefined;

    const requestId = `req_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const runId = `run_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
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
