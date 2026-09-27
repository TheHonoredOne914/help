import { Router } from "express";
import {
  getArchiveContext,
  upsertArchiveContext,
  createMessage,
  getMessagesByConversationId,
  updateMessage,
} from "../db.js";
import { getGroqClient } from "../lib/groq-client.js";
import { getOllamaClient } from "../lib/ollama-client.js";
import { getNvidiaClient } from "../lib/nvidia-client.js";
import { getGeminiClient, isGeminiEnabled } from "../lib/gemini-client.js";
import { getCerebrasClient } from "../lib/cerebras-client.js";
import { getOpenCodeZenClient } from "../lib/opencode-zen-client.js";

import { classifyTopic, type TopicType } from "../lib/rag.js";
import { verifyAnswer, type VerifyClients } from "../lib/verify.js";
import { extractKeys, parseProviderModelId } from "../lib/provider-router.js";
import { createSseWriter } from "../lib/sse.js";
import type { RequestKeys } from "../lib/types.js";
import { logger } from "../lib/logger.js";
import type { ResearchRunIdentity } from "../core/pipeline/pipeline-events.js";
import { agendaOutputDepthForMode, inferResearchMode } from "../core/config/research-mode.js";
import { buildAgendaContract } from "../core/agenda/agenda-contract.js";
import { buildBucketedQueryPlanWithExpansion } from "../core/retrieval/query-planning/build-query-plan.js";
import { runBucketedRetrieval } from "../core/retrieval/bucketed-retrieval.js";
import { runCouncilSession } from "../core/council/index.js";
import { normalizeProviderError } from "../core/run-state/index.js";
import { TerminalWriteGuard } from "../core/streaming/run-stream/index.js";
import { buildCoreProviderRouter } from "./anthropic/core-provider-router.js";
import {
  buildCouncilFinalAnswer,
  buildCouncilMetadata,
  councilRetrievalSourceToEvidenceInput,
  __councilTestHooks,
} from "./anthropic/council-render.js";
import {
  DEFAULT_GROQ_MODEL,
  GROQ_LIVE_FALLBACK_NATIVE,
  groqNativeModelFromRequest,
  loadMessageRouteContext,
  remapUnavailableGroqModelId,
} from "./anthropic/message-preflight.js";
import {
  assistantPersistenceStore,
} from "./anthropic/persistence-store.js";
import {
  buildLegacyTerminalMetadata,
  coreProviderNameFromModel,
  embedPipelineMeta,
  envelopeRunEvent,
  isResearchRouteMode,
  modeAwareFailureTitle,
  normalizeLegacySsePayload,
  type PipelineMetadata,
} from "./anthropic/pipeline-types.js";
import { executeResearchRun } from "./anthropic/research-run.js";
import { ensureResearchWorkerModels } from "./anthropic/worker-models.js";
import { registerAnthropicEnhanceRoute } from "./anthropic-enhance-route.js";
import { registerAnthropicMetaRoutes } from "./anthropic-meta-routes.js";
import {
  maybeMergeArchive,
  persistAssistantCompleted,
  persistAssistantFailed,
} from "./assistant-persistence.js";


function extractArchiveFacts(answer: string, topicType?: TopicType): string {
  const lines = answer
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const isRelevantLine = (line: string): boolean => {
    const hasCitation = /^[*-]/.test(line) || /^\d+\./.test(line) || /\b(Source\s*\d+|\[\d+\])\b/i.test(line);
    if (!hasCitation) return false;
    const hasNumber = /\d/.test(line);

    if (topicType === "democracy_civil_liberties") {
      return /freedom|democracy|civil|rights|press|ranking|index|decline|erosion|amnesty|hrw|rsf|v.?dem|eiu|uapa|sedition|backslid|authoritar|arrested|detained|shutdown|crackdown|dissent|ngos?|fcra|minority|election|constitution/i.test(line);
    }
    if (topicType === "media_press") {
      return /journalist|press|media|article 19|sedition|censorship|rsf|cpj|freedom house|media freedom|newsroom|reporter|editor|broadcast/i.test(line);
    }
    if (topicType === "economic") {
      return hasNumber && /gdp|budget|fiscal|inflation|trade|rbi|monetary|gst|tax|growth|poverty|imf|world bank|crore|lakh|billion|million|percent|%/i.test(line);
    }
    if (topicType === "environment") {
      return /climate|carbon|emission|pollution|forest|renewable|solar|wind|energy|temperature|ipcc|cop|paris|biodiversity/i.test(line);
    }
    return hasNumber || /court|judg|cag|ncrb|mea|pib|act|article|parliament/i.test(line);
  };

  const factLines = lines.filter(isRelevantLine);
  return factLines.slice(0, 24).join("\n").slice(0, 4000);
}

function mergeLines(existing: string, incoming: string): string {
  const merged = [...new Set(
    [existing, incoming]
      .flatMap((text) => text.split("\n"))
      .map((line) => line.trim())
      .filter(Boolean)
  )];
  return merged.slice(-32).join("\n").slice(0, 5000);
}

async function mergeArchiveSummaries(
  existing: string,
  incoming: string,
  _opts: { groqKey?: string | null } = {},
): Promise<string> {
  const incomingLines = incoming.split("\n").map(l => l.trim()).filter(Boolean);
  const flaggedLines = incomingLines.filter(l =>
    /\b\d+(?:\.\d+)?%|\b\d{2,}(?:,\d{3})+\b/.test(l) && !/\[Source \d+\]/i.test(l)
  );

  if (incomingLines.length > 0 && flaggedLines.length > incomingLines.length * 0.3) {
    logger.warn({ flaggedCount: flaggedLines.length }, "Archive summary may contain unverified statistics");
    const safeLines = incomingLines.filter(l => !flaggedLines.includes(l) || /\[Source \d+\]/i.test(l));
    return mergeLines(existing, safeLines.join("\n"));
  }

  return mergeLines(existing, incoming);
}

async function mergeAssistantAnswerIntoArchiveContext(
  archiveId: number | null | undefined,
  existingSummary: string | undefined,
  answer: string,
  topicType?: TopicType,
): Promise<void> {
  if (!archiveId || !answer.trim()) return;

  const distilled = extractArchiveFacts(answer, topicType);
  if (!distilled) return;

  let base = await getArchiveContext(archiveId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const seenUpdatedAt = base?.updated_at ?? null;
    const mergedSummary = await mergeArchiveSummaries(
      base?.summary ?? existingSummary ?? "",
      distilled,
      {},
    );
    const latest = await getArchiveContext(archiveId);
    if ((latest?.updated_at ?? null) !== seenUpdatedAt) {
      base = latest;
      if (attempt === 1) return;
      continue;
    }
    await upsertArchiveContext(archiveId, mergedSummary);
    return;
  }
}

export { ensureResearchWorkerModels, buildCoreProviderRouter, __councilTestHooks };

// â”€â”€â”€ Gemini streaming helper (OpenAI-compat) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Since gemini-client now returns an OpenAI instance, this is now just
// a standard OpenAI streaming call. Kept as a named function for clarity.
async function streamGeminiResponse(
  client: any,
  modelId: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  send: (data: Record<string, unknown>) => void,
  maxOutputTokens = 8192,
  signal?: AbortSignal,
): Promise<string> {
  const stream = await client.chat.completions.create({
    model: modelId,
    max_tokens: maxOutputTokens,
    messages: [{ role: "system", content: systemPrompt }, ...messages.filter(m => m.role !== "system")],
    stream: true,
    signal,
  });
  let fullResponse = "";
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      fullResponse += delta;
      send({ content: delta });
    }
  }
  return fullResponse;
}

async function callGeminiNonStreaming(
  client: any,
  modelId: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  maxOutputTokens = 8192
): Promise<string> {
  const resp = await client.chat.completions.create({
    model: modelId,
    max_tokens: maxOutputTokens,
    messages: [{ role: "system", content: systemPrompt }, ...messages.filter(m => m.role !== "system")],
  });
  return resp.choices?.[0]?.message?.content ?? "";
}

const router = Router();
registerAnthropicMetaRoutes(router);
registerAnthropicEnhanceRoute(router, { callGeminiNonStreaming });

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isRateLimitOrQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string; code?: string };
  if (e.status === 429 || e.status === 529) return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("quota") || msg.includes("overloaded");
}

interface ActiveResearchRun {
  identity: ResearchRunIdentity;
  abortController: AbortController;
  cancel: (reason: string) => Promise<void>;
  cancelled: boolean;
}

const activeResearchRunsByConversation = new Map<number, ActiveResearchRun>();

async function handleProviderAllModes(
  req: any,
  res: import("express").Response,
  opts: {
    rawModelId: string;
    mode: string;
    conversationId: number;
    chatMessages: { role: "user" | "assistant"; content: string }[];
    userQuery: string;
    userSystemPrompt: string;
    archiveId?: number;
    archiveTopic?: string;
    archiveSummary?: string;
    groqKey?: string | null;
    ollamaKey?: string | null;
    ollamaBase?: string | null;
    nvidiaKey?: string | null;
    geminiKey?: string | null;
    tavilyKey?: string | null;
    serperKey?: string | null;
    exaKey?: string | null;
    braveKey?: string | null;
    firecrawlKey?: string | null;
    jinaKey?: string | null;
    openrouterKey?: string | null;
    githubToken?: string | null;
    cerebrasKey?: string | null;
    opencodeKey?: string | null;
    hfToken?: string | null;
    getIsDisconnected?: () => boolean;
    abortSignal?: AbortSignal;
    runIdentity?: ResearchRunIdentity;
  }
) {
  const {
    rawModelId,
    mode,
    conversationId,
    chatMessages,
    userQuery,
    userSystemPrompt,
    groqKey,
    ollamaKey,
    ollamaBase,
    nvidiaKey,
    openrouterKey,
    githubToken,
    runIdentity,
  } = opts;
  const isGemini = rawModelId.startsWith("gemini/");
  const isSearch = isResearchRouteMode(mode);
  const MUN_NORMAL_BASE = `You are BestDel â€” a MUN research assistant built for Indian delegates and conference-goers.

## IDENTITY
- You serve Indian MUN students: HMUN India, SPECMUN, college MUNs across India
- Default country perspective: India (unless user specifies otherwise)
- Tone: expert but friendly, like a senior delegate mentoring a junior
- If asked who made you, who your founder is, or who built BestDel: answer that BestDel was founded by Carren Mathew Joseph, and that Dhruv Sharma Mahate made great contributions in the later stages of development. Do not mention any other names.

## HOW TO RESPOND TO DIFFERENT QUERY TYPES:

**For casual greetings (hi, hello, how are you):**
Respond naturally. Do NOT give menus or numbered lists. Just say hi and ask how you can help with their MUN prep today.

**For research questions:**
Be structured. Use headers. Cite sources. Data first.

**For position paper help:**
Use format: Background â†’ Committee Mandate â†’ India's Position â†’ Proposed Solutions

**For speech/resolution drafting:**
Use proper UN language. Preambulatory clauses for preambles. Operative clauses for operative sections.

**For debate prep (POIs, rebuttals):**
Give sharp, specific arguments. Include counter-arguments to anticipate.

## WHAT YOU ALWAYS KNOW:
- India is a permanent observer, not P5 â€” it votes with G77 and NAM frequently
- India's key foreign policy pillars: strategic autonomy, non-alignment heritage, development focus
- India's constitutional articles most relevant to MUN topics: Art. 12-35 (Fundamental Rights), Art. 51 (International Peace), Art. 253 (Parliament's power to implement treaties)
- India has NOT ratified: NPT, CTBT, Rome Statute â€” these are important MUN facts
- India HAS ratified: UNCRC, CEDAW, ICCPR, ICESCR â€” cite these for human rights debates`;
  const legacyStreamGuard = new TerminalWriteGuard();
  const finish = () => {
    if (res.writableEnded) return;
    const payload = normalizeLegacySsePayload(runIdentity, { eventType: "completed", terminalStatus: "completed", done: true });
    if (legacyStreamGuard.canWrite(payload)) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
    res.end();
  };

  // Resolve provider client
  let client: any;
  let modelId: string;
  let providerLabel: string;

  const parsedModel = parseProviderModelId(rawModelId);
  if (parsedModel.prefix === "groq") {
    client = getGroqClient(groqKey);
    modelId = remapUnavailableGroqModelId(parsedModel.modelId);
    providerLabel = "groq";
  } else if (parsedModel.prefix === "ollama") {
    client = getOllamaClient(ollamaKey, ollamaBase);
    modelId = parsedModel.modelId;
    providerLabel = "ollama";
  } else if (parsedModel.prefix === "gemini") {
    client = getGeminiClient(opts.geminiKey);
    modelId = parsedModel.modelId;
    providerLabel = "gemini";
  } else if (parsedModel.prefix === "openrouter") {
    const { getOpenRouterClient } = await import("../lib/openrouter-client.js");
    client = getOpenRouterClient(openrouterKey ?? null);
    modelId = parsedModel.modelId;
    providerLabel = "openrouter";
  } else if (parsedModel.prefix === "github") {
    const { getGithubModelsClient } = await import("../lib/github-models-client.js");
    client = getGithubModelsClient(githubToken ?? null);
    modelId = parsedModel.modelId;
    providerLabel = "github";
  } else if (parsedModel.prefix === "cerebras") {
    client = getCerebrasClient(opts.cerebrasKey ?? process.env.CEREBRAS_API_KEY);
    modelId = parsedModel.modelId;
    providerLabel = "cerebras";
  } else if (parsedModel.prefix === "opencode") {
    client = getOpenCodeZenClient(opts.opencodeKey ?? null);
    modelId = parsedModel.modelId;
    providerLabel = "opencode";
  } else {
    client = getNvidiaClient(nvidiaKey);
    modelId = parsedModel.modelId;
    providerLabel = "nvidia";
  }

  const send = (data: object): void => {
    if (res.writableEnded || res.destroyed) return;
    try {
      const payload = normalizeLegacySsePayload(runIdentity, data as Record<string, unknown>);
      if (!legacyStreamGuard.canWrite(payload)) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Client already disconnected â€” swallow silently
    }
  };

  const NORMAL_SYS = userSystemPrompt.trim()
    ? `${MUN_NORMAL_BASE}\n\n--- Delegate's custom instructions ---\n${userSystemPrompt.trim()}\n--- end ---`
    : MUN_NORMAL_BASE;

  try {
    // Bail early if client already disconnected â€” don't burn API quota
    if (opts.getIsDisconnected?.()) { res.end(); return; }

    if (!isSearch) {
    // â”€â”€ NORMAL MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let full = "";
    let tokenCount = 0;
    let streamFailed = false;
    let streamErrorMessage = "";
    const start = Date.now();
    try {
      if (isGemini) {
        full = await streamGeminiResponse(client, modelId, NORMAL_SYS, [{ role: "system" as const, content: NORMAL_SYS }, ...chatMessages], send, 2048);
      } else {
        const stream = await client.chat.completions.create({
          model: modelId,
          max_tokens: 2048,
          messages: [{ role: "system", content: NORMAL_SYS }, ...chatMessages],
          stream: true,
        });
        for await (const chunk of stream) {
          if (opts.abortSignal?.aborted || opts.getIsDisconnected?.()) break;
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) { full += delta; tokenCount++; send({ content: delta }); }
        }
        if (providerLabel === "ollama" || providerLabel === "nvidia") {
          const elapsed = (Date.now() - start) / 1000;
          send({ tokensPerSec: Math.round(tokenCount / Math.max(elapsed, 0.1)) });
        }
      }
    } catch (err: any) {
      streamFailed = true;
      streamErrorMessage = isRateLimitOrQuotaError(err)
        ? "Provider rate limit or quota stopped the response before completion."
        : err?.status === 404
          ? "This drafting model isn't available. Pick another model in the composer."
          : "Model stream failed before completion.";
      if (isRateLimitOrQuotaError(err)) send({ rateLimited: true });
      else if (err?.status === 404) send({ modelNotPulled: true, modelId });
      send({ eventType: "provider_error", terminalStatus: "provider_error", error: streamErrorMessage, done: true });
    }
    if (streamFailed) {
      await persistAssistantFailed({
        store: assistantPersistenceStore,
        conversationId,
        assistantMessageId: runIdentity?.assistantMessageId,
        title: "Response Failed",
        message: streamErrorMessage,
        partialContent: full,
        metadata: runIdentity
          ? buildLegacyTerminalMetadata(runIdentity, "provider_error", {
              liveRetrievalUsed: false,
              error: { code: "normal_stream_failed", message: streamErrorMessage, recoverable: true },
            } as PipelineMetadata)
          : null,
      });
      if (!res.writableEnded) res.end();
      return;
    }
    // Only verify normal mode responses if they look substantive and factual
    const isSubstantive = full.trim().length > 200;
    const looksFactual = /\b(according to|research shows|data indicates|statistics|per cent|percent|million|billion|treaty|resolution|article \d+|section \d+|UN doc|A\/RES|S\/RES)\b/i.test(full);

    if (isSubstantive && looksFactual) {
      send({ verifying: true });
      try {
        send({ verifying: true, verifier: "gemini" });
        const verifyClients: VerifyClients = {
          gemini: opts.geminiKey ? getGeminiClient(opts.geminiKey) : null,
          groq: opts.groqKey ? getGroqClient(opts.groqKey) : null,
          nvidia: opts.nvidiaKey ? getNvidiaClient(opts.nvidiaKey) : null,
        };
        const verification = await verifyAnswer(userQuery, [], full, {
          geminiKey: opts.geminiKey,
          hfToken: opts.hfToken ?? null,
          groqKey: opts.groqKey,
          nvidiaKey: opts.nvidiaKey,
          clients: verifyClients,
          onChunk: (chunk) => send({ qwenThinkingChunk: chunk }),
        });
        send({ verified: verification });
      } catch { /* non-critical â€” skip if verification fails */ }
    }
    // For simple conversational chats: skip verification entirely
      if (full) {
        await persistAssistantCompleted({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: runIdentity?.assistantMessageId,
          content: full,
        });
      }
      finish();
      return;
    }

    send({
      eventType: "failed",
      terminalStatus: "failed",
      error: "Research modes must use the core pipeline.",
      code: "legacy_research_removed",
      done: true,
    });
    finish();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provider failed";
    send({ eventType: "provider_error", terminalStatus: "provider_error", error: message, done: true });
    if (!res.writableEnded) res.end();
  }
}

// â”€â”€ Rhetorics Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getRhetoricsSystemPrompt(type: string, temperature: number): string {
  const creativityLabel =
    temperature < 0.7 ? "structured and precise"
    : temperature < 1.0 ? "vivid and expressive"
    : "wildly creative, rhythm-first, break conventions";

  switch (type) {
    case "kavita":
      return `You are a Hindi poet writing in English script (Hinglish transliteration) for MUN delegates.
Style: ${creativityLabel}.
Rules:
- Write entirely in Hinglish (Hindi words spelled phonetically in English â€” e.g. "Hum uthenge, hum bolenge, duniya sun legi humari baat")
- Strong rhyme and meter â€” every stanza must have a beat you can feel
- Each kavita must be about the delegate's committee topic or country position
- End with a punchy 2-line closing couplet (muktak) that can be used as a speech closer
- No English explanation unless asked. Just the poem.`;

    case "speech":
      return `You are a MUN coach writing opening speeches for Indian delegates.
Style: ${creativityLabel}.
Structure (always follow this):
1. Hook â€” one striking sentence or statistic that stops the room (max 2 lines)
2. Country context â€” India's position, stated as conviction not opinion (3-4 lines)
3. Core argument â€” the delegate's main push, with one cited fact (4-5 lines)
4. Call to the committee â€” what action the delegate demands (2-3 lines)
5. Closing line â€” memorable, quotable, ideally echoes the hook

Tone: authoritative, passionate, never apologetic. India speaks, not requests.
Length: 90-120 seconds when read aloud (~200-250 words).`;

    case "debate":
      return `You are a sharp MUN delegate taking the OPPOSING position to the user.
Style: ${creativityLabel}.
Rules:
- Argue the counter-position with conviction â€” pick up the user's last point and directly rebut it
- Use real geopolitical logic, not strawmen
- Occasionally quote a real resolution number or treaty to add authority
- Keep responses to 4-6 sentences â€” this is a rapid debate, not a speech
- End each turn with a pointed question or challenge back to the user
- Never break character or agree with the user mid-debate
After your rebuttal, on a NEW LINE starting with "SUGGESTIONS:", write exactly 3 short counter-argument starters the user could use next, separated by " | ". Example: SUGGESTIONS: India's abstention in 2021... | OCHA data shows... | Resolution 2334 contradicts...`;

    default:
      return "You are a helpful MUN assistant.";
  }
}

function rhetoricsTurns(
  chatHistory: { role: "user" | "assistant"; content: string }[],
  userQuery: string,
): { role: "user" | "assistant"; content: string }[] {
  const recent = chatHistory.slice(-6);
  const last = recent[recent.length - 1];
  if (last?.role === "user" && last.content.trim() === userQuery.trim()) return recent;
  return [...recent, { role: "user", content: userQuery }];
}

function publishDebateSuggestions(fullText: string, send: (data: Record<string, unknown>) => void): string {
  const sugMatch = fullText.match(/SUGGESTIONS:\s*(.+)/i);
  if (!sugMatch || sugMatch.index == null) return fullText;
  const suggestions = sugMatch[1].split("|").map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
  if (suggestions.length > 0) send({ suggestions });
  return fullText.slice(0, sugMatch.index).trimEnd();
}

export async function streamRhetoricsResponse(
  client: any,
  systemPrompt: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  userQuery: string,
  temperature: number,
  send: (data: Record<string, unknown>) => void,
  keys: RequestKeys,
  modelId = GROQ_LIVE_FALLBACK_NATIVE,
  abortSignal?: AbortSignal,
): Promise<string> {
  let fullText = "";
  const turns = rhetoricsTurns(chatHistory, userQuery);
  try {
    const stream = await client.chat.completions.create({
      model: remapUnavailableGroqModelId(modelId),
      max_tokens: 1200,
      temperature,
      messages: [
        { role: "system" as const, content: systemPrompt },
        ...turns,
      ],
      stream: true,
      signal: abortSignal,
    });
    for await (const chunk of stream) {
      if (abortSignal?.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        send({ content: delta });
      }
    }
    return publishDebateSuggestions(fullText, send);
  } catch (err: unknown) {
    if (abortSignal?.aborted) return publishDebateSuggestions(fullText, send);
    if (!fullText && keys.geminiKey && isGeminiEnabled(keys.geminiKey)) {
      const gemini = getGeminiClient(keys.geminiKey);
      const geminiText = await streamGeminiResponse(
        gemini,
        "gemini-2.0-flash",
        systemPrompt,
        turns,
        send,
        1200,
        abortSignal,
      );
      return publishDebateSuggestions(geminiText, send);
    }
    if (fullText.trim()) {
      const error = new Error("Speech generation stopped before completion.") as Error & { partialText?: string };
      error.partialText = publishDebateSuggestions(fullText, send);
      throw error;
    }
    throw err instanceof Error ? err : new Error("Speech generation failed");
  }
}

async function handleRhetorics(
  req: import("express").Request,
  res: import("express").Response,
  conversationId: number,
  userQuery: string,
  type: string,
  temperature: number,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  keys: RequestKeys,
  archiveContextPrompt = "",
  archiveId?: number,
  archiveSummary?: string,
  requestedModel?: string,
  abortSignal?: AbortSignal,
  isDisconnected?: () => boolean,
): Promise<void> {
  const writer = createSseWriter(res);
  const send = (data: Record<string, unknown>) => writer.sendEvent(data);
  const systemPrompt = [
    getRhetoricsSystemPrompt(type, temperature),
    archiveContextPrompt.trim(),
  ].filter(Boolean).join("\n\n");
  const topic = classifyTopic(userQuery);
  const client = getGroqClient(keys.groqKey);
  const groqModel = groqNativeModelFromRequest(requestedModel);
  let fullText = "";
  let failed = false;
  let failureMessage = "Speech generation didn't return text. Pick another model in the composer, or try again.";
  try {
    fullText = await streamRhetoricsResponse(client, systemPrompt, chatHistory, userQuery, temperature, send, keys, groqModel, abortSignal);
  } catch (err) {
    failed = true;
    const partial = (err as { partialText?: string }).partialText;
    if (typeof partial === "string") fullText = partial;
    if (err instanceof Error && err.message) failureMessage = err.message;
    send({ eventType: "provider_error", terminalStatus: "provider_error", error: failureMessage, partial: fullText.trim().length > 0, done: true });
  }
  if (failed) {
    await persistAssistantFailed({
      store: assistantPersistenceStore,
      conversationId,
      title: "Response Failed",
      message: failureMessage,
      partialContent: fullText,
    });
  } else if (fullText.trim()) {
    if (req.body?.regenerate === true) {
      const existing = await getMessagesByConversationId(conversationId);
      const lastAssistant = [...existing].reverse().find((message) => message.role === "assistant");
      if (lastAssistant) await updateMessage(lastAssistant.id, { content: fullText });
      else await createMessage(conversationId, "assistant", fullText);
    } else {
      await createMessage(conversationId, "assistant", fullText);
    }
    if (!isDisconnected?.()) {
      await mergeAssistantAnswerIntoArchiveContext(archiveId, archiveSummary, fullText, topic);
    }
  } else {
    await persistAssistantFailed({
      store: assistantPersistenceStore,
      conversationId,
      title: "Response Failed",
      message: failureMessage,
    });
    send({ eventType: "provider_error", terminalStatus: "provider_error", error: failureMessage, done: true });
  }
  writer.finishStream();
}

router.post("/anthropic/conversations/:id/messages", async (req, res) => {
  const preflight = await loadMessageRouteContext(req, res);
  if (!preflight.ok) {
    res.status(preflight.status).json(preflight.body);
    return;
  }

  const {
    conversationId,
    userContent,
    mode,
    freshnessDecision,
    freshnessResearchMode,
    routeMode,
    effectiveResearchMode,
    selectedResearchMode,
    rhetoricsType,
    temperature,
    userSystemPrompt,
    combinedSystemPrompt,
    autoFallback,
    rawNormalModel,
    effectiveWebModels,
    streamTimeoutMs: STREAM_TIMEOUT_MS,
    archiveId,
    archiveTopic,
    archiveSummary,
    assistantMessage,
    runIdentity,
    chatMessages,
  } = preflight.context;
  const { requestId, runId } = runIdentity;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Track client disconnects to stop burning API quota on abandoned requests
  let clientDisconnected = false;
  const requestAbortController = new AbortController();
  req.on("close", () => {
    clientDisconnected = true;
    requestAbortController.abort();
  });

  // PHASE 3: SSE Heartbeat â€” keeps connection alive through high-latency search phases
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": heartbeat\n\n");
    }
  }, 20000);

  const isGroq = rawNormalModel.startsWith("groq/");
  const isOllama = rawNormalModel.startsWith("ollama/");
  const isNvidia = rawNormalModel.startsWith("nvidia/");
  const isGeminiModel = rawNormalModel.startsWith("gemini/");
  const isGithubModel = rawNormalModel.startsWith("github/");
  const writer = createSseWriter(res);
  const sendRunEvent = (eventType: string, payload: Record<string, unknown> = {}) => {
    writer.sendEvent(envelopeRunEvent(runIdentity, eventType, payload));
  };
  const previousRun = activeResearchRunsByConversation.get(conversationId);
  if (previousRun && previousRun.identity.runId !== runId) {
    previousRun.cancelled = true;
    await previousRun.cancel("superseded_by_new_prompt");
  }
  const activeRun: ActiveResearchRun = {
    identity: runIdentity,
    abortController: requestAbortController,
    cancelled: false,
    cancel: async (reason: string) => {
      activeRun.cancelled = true;
      if (!requestAbortController.signal.aborted) requestAbortController.abort(reason);
      await persistAssistantFailed({
        store: assistantPersistenceStore,
        conversationId: Number(activeRun.identity.conversationId),
        assistantMessageId: activeRun.identity.assistantMessageId,
        title: "Research Cancelled",
        message: reason,
        metadata: buildLegacyTerminalMetadata(activeRun.identity, "cancelled", {
          error: { code: "cancelled", message: reason, recoverable: true },
        } as PipelineMetadata),
      }).catch((err) => req.log?.warn?.({ err }, "Failed to persist cancelled research state"));
      sendRunEvent("cancelled", { cancelled: true, reason, done: true });
      if (!res.writableEnded) res.end();
    },
  };
  activeResearchRunsByConversation.set(conversationId, activeRun);
  sendRunEvent("run_started", {
    selectedResearchMode: selectedResearchMode ?? null,
    inferredResearchMode: inferResearchMode(userContent, mode === "web_search" ? "web_search" : "deep_research"),
    freshnessDecision,
    freshnessAutoRouted: freshnessResearchMode !== null,
    autoFallback,
  });
  const streamTimeout = setTimeout(() => {
    if (res.writableEnded) return;
    void (async () => {
      activeRun.cancelled = true;
      if (!requestAbortController.signal.aborted) {
        requestAbortController.abort("stream_timeout");
      }
      const timeoutLabel = STREAM_TIMEOUT_MS >= 120_000
        ? `${Math.round(STREAM_TIMEOUT_MS / 60_000)} minutes`
        : `${Math.max(1, Math.round(STREAM_TIMEOUT_MS / 1000))} seconds`;
      const timeoutMessage = `Request timed out after ${timeoutLabel}`;
      await persistAssistantFailed({
        store: assistantPersistenceStore,
        conversationId,
        assistantMessageId: assistantMessage?.id,
        title: "Research Failed",
        message: timeoutMessage,
        metadata: buildLegacyTerminalMetadata(runIdentity, "failed", {
          researchMode: effectiveResearchMode,
          error: { code: "stream_timeout", message: timeoutMessage, recoverable: true },
        } as PipelineMetadata),
      }).catch((err) => req.log?.error?.({ err }, "Failed to persist timeout state"));
      sendRunEvent("failed", {
        error: timeoutMessage,
        code: "stream_timeout",
        retryable: true,
        done: true,
      });
      writer.finishStream();
    })();
  }, STREAM_TIMEOUT_MS);

  try {
    const isOpenRouter = rawNormalModel.startsWith("openrouter/");
    const isCerebras = rawNormalModel.startsWith("cerebras/");
    const isOpenCode = rawNormalModel.startsWith("opencode/");
    if (!(isGroq || isOllama || isNvidia || isGeminiModel || isOpenRouter || isGithubModel || isCerebras || isOpenCode)) {
      writer.sendTerminalError({
        error: "Only groq/, ollama/, nvidia/, gemini/, openrouter/, github/, cerebras/, and opencode/ model prefixes are supported.",
        code: "unsupported_model_prefix",
        retryable: false,
      });
      return;
    }

    // Extract all provider keys from request headers â€” do this ONCE per request
    const keys: RequestKeys = extractKeys(req);
    const simpleMessages = chatMessages
      .filter((m) => typeof m.content === "string")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));

    if (routeMode === "council") {
      const selectedCouncilModel = (effectiveWebModels[0] ?? rawNormalModel) || DEFAULT_GROQ_MODEL;
      const coreProvider = buildCoreProviderRouter(keys, selectedCouncilModel);
      if (coreProvider.error || !coreProvider.router || !coreProvider.providerName || !coreProvider.model) {
        const message = coreProvider.error ?? "Council provider could not be resolved.";
        sendRunEvent("provider_error", {
          providerError: message,
          providerConfigurationError: true,
          coreGenerationMode: "council_model_required",
          done: true,
        });
        await persistAssistantFailed({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage?.id,
          title: "Provider Error",
          message: `Provider configuration error: ${message}`,
          metadata: buildLegacyTerminalMetadata(runIdentity, "provider_error", {
            researchMode: "council",
            liveRetrievalUsed: true,
            legacyFallbackUsed: false,
            error: { code: "provider_configuration_error", message, recoverable: true },
          } as PipelineMetadata),
        });
        writer.finishStream();
        return;
      }

      req.log?.info?.({
        event: "council_model_resolved",
        runId,
        conversationId,
        selectedCouncilModel,
        resolvedProviderName: coreProvider.providerName,
        resolvedModel: coreProvider.model,
      }, "council model resolved");

      const agendaContract = buildAgendaContract({
        requestId,
        originalUserQuery: userContent,
        outputDepth: agendaOutputDepthForMode("council"),
      });
      const queryPlan = await buildBucketedQueryPlanWithExpansion(agendaContract, "council", {
        providerRouter: coreProvider.router,
        providerName: coreProvider.providerName,
        model: coreProvider.model,
      });
      const councilRetrieval = await runBucketedRetrieval(queryPlan, {
        live: true,
        allowMock: false,
        mode: "council",
        providerKeys: {
          tavily: keys.tavilyKey ?? undefined,
          brave: keys.braveKey ?? undefined,
          serper: keys.serperKey ?? undefined,
          exa: keys.exaKey ?? undefined,
          firecrawl: keys.firecrawlKey ?? undefined,
          jina: keys.jinaKey ?? undefined,
          scraperapi: keys.scraperapiKey ?? undefined,
          zenrows: keys.zenrowsKey ?? undefined,
          scrapingbee: keys.scrapingbeeKey ?? undefined,
          geekflare: keys.geekflareKey ?? undefined,
        },
        useCache: true,
        abortSignal: requestAbortController.signal,
        emit: (event) => {
          sendRunEvent("core_pipeline_event", {
            type: "core_pipeline_event",
            corePipelineEvent: event.type,
            corePipelineData: event.data ?? {},
          });
        },
      });
      const councilSession = await runCouncilSession({
        userQuery: userContent,
        identity: runIdentity,
        providerRouter: coreProvider.router,
        assignments: {
          default: { providerName: coreProvider.providerName, model: coreProvider.model },
          chief: { providerName: coreProvider.providerName, model: coreProvider.model },
        },
        agendaContract,
        rawSources: councilRetrieval.enrichedResults.map(councilRetrievalSourceToEvidenceInput),
        signal: requestAbortController.signal,
        sendEvent: (event) => writer.sendEvent(event),
        enrichmentKeys: {
          jinaKey: keys.jinaKey ?? undefined,
          firecrawlKey: keys.firecrawlKey ?? undefined,
          scraperapiKey: keys.scraperapiKey ?? undefined,
          zenrowsKey: keys.zenrowsKey ?? undefined,
          scrapingbeeKey: keys.scrapingbeeKey ?? undefined,
          geekflareKey: keys.geekflareKey ?? undefined,
        },
      });
      const finalAnswer = buildCouncilFinalAnswer(councilSession, councilRetrieval);
      const councilQualityGate = __councilTestHooks.runCouncilQualityGate(councilSession, councilRetrieval, finalAnswer, runIdentity);
      const metadata = buildCouncilMetadata(runIdentity, councilSession, councilRetrieval, finalAnswer, councilQualityGate);
      sendRunEvent("answer_delta", { content: finalAnswer });
      sendRunEvent(councilSession.terminalStatus, {
        done: true,
        terminalStatus: councilSession.terminalStatus,
        coreGenerationUsed: false,
        legacyFallbackUsed: false,
        liveRetrievalUsed: true,
        councilSession,
        sourceGapReport: metadata.sourceGapReport,
        citationStatus: metadata.citationStatus,
        sourceContract: metadata.sourceContract,
        sources: metadata.sources,
        fullSourceManifest: {
          totalSources: metadata.sources?.length ?? 0,
          sources: (metadata.sources ?? []).map((source) => ({
            index: source.sourceId,
            title: source.title,
            url: source.url,
            badge: source.sourceType ?? "WEB",
            sourceType: source.sourceType ?? "web",
            score: 0,
            hasFullContent: false,
            contentPreview: "",
          })),
        },
      });
      if (councilSession.terminalStatus === "cancelled") {
        await persistAssistantFailed({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage?.id,
          title: "Council Research Cancelled",
          message: "Council run was cancelled before completion.",
          partialContent: finalAnswer,
          metadata,
        });
      } else {
        await persistAssistantCompleted({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage?.id,
          content: embedPipelineMeta(finalAnswer, metadata),
          metadata,
          runId,
          terminalStatus: councilSession.terminalStatus,
        });
      }
      writer.finishStream();
      return;
    }

    if (isResearchRouteMode(routeMode)) {
      await executeResearchRun({
        context: preflight.context,
        keys,
        signal: requestAbortController.signal,
        isDisconnected: () => clientDisconnected,
        sendRunEvent,
        finishStream: () => writer.finishStream(),
        logInfo: (obj, msg) => req.log?.info?.(obj, msg),
        mergeArchive: (finalAnswer) => mergeAssistantAnswerIntoArchiveContext(archiveId, archiveSummary, finalAnswer, classifyTopic(userContent)),
      });
      return;
    }

    if (mode === "rhetorics" && rhetoricsType) {
      await handleRhetorics(
        req,
        res,
        conversationId,
        userContent,
        rhetoricsType,
        temperature,
        simpleMessages,
        keys,
        combinedSystemPrompt,
        archiveId ?? undefined,
        archiveSummary,
        rawNormalModel,
        requestAbortController.signal,
        () => clientDisconnected,
      );
      clearTimeout(streamTimeout);
      clearInterval(heartbeatInterval);
      return;
    }

    await handleProviderAllModes(req, res, {
      rawModelId: rawNormalModel,
      mode,
      conversationId,
      chatMessages: simpleMessages,
      userQuery: userContent,
      userSystemPrompt: combinedSystemPrompt,
      groqKey: keys.groqKey,
      ollamaKey: keys.ollamaKey,
      ollamaBase: keys.ollamaBase,
      nvidiaKey: keys.nvidiaKey,
      geminiKey: keys.geminiKey,
      openrouterKey: keys.openrouterKey,
      githubToken: keys.githubToken,
      cerebrasKey: keys.cerebrasKey,
      opencodeKey: keys.opencodeKey,
      hfToken: keys.hfToken,
      getIsDisconnected: () => clientDisconnected,
      abortSignal: requestAbortController.signal,
      runIdentity,
    });
    return;
  } catch (err) {
    req.log?.error?.({ err }, "Error processing message");
    const isAbort = (err as any)?.name === "AbortError" || requestAbortController.signal.aborted;
    const providerFailureReports = (err as any)?.safeDetails?.providerFailureReports ?? (err as any)?.providerFailureReports ?? [];
    const providerError = Array.isArray(providerFailureReports) && providerFailureReports.length > 0
      ? normalizeProviderError({
          provider: providerFailureReports[0]?.providerName ?? coreProviderNameFromModel(rawNormalModel),
          model: providerFailureReports[0]?.model ?? rawNormalModel,
          status: providerFailureReports[0]?.httpStatus,
          code: providerFailureReports[0]?.code ?? "PROVIDER_ERROR",
          message: providerFailureReports[0]?.message ?? "Provider failed during research.",
          stage: providerFailureReports[0]?.stage ?? "research_pipeline",
          retryable: providerFailureReports[0]?.retryable,
        })
      : null;
    const code = isAbort
      ? "cancelled"
      : providerError
        ? providerError.code
        : (err as any)?.code === "SOURCE_USAGE_VALIDATION_FAILED"
      ? "SOURCE_USAGE_VALIDATION_FAILED"
      : "chat_processing_error";
    const terminalStatus = isAbort ? "cancelled" : providerError ? "provider_error" : "failed";
    const message = isAbort
      ? "Research run was cancelled before completion."
      : providerError
        ? `${providerError.provider ?? "Provider"} ${providerError.model ?? rawNormalModel} failed${providerError.httpStatus ? ` with HTTP ${providerError.httpStatus}` : ""}: ${providerError.message}`
        : code === "SOURCE_USAGE_VALIDATION_FAILED"
      ? "Source usage validation failed. The model listed sources without extracting/supporting claims."
      : "AI error occurred";
    const recoverable = code === "SOURCE_USAGE_VALIDATION_FAILED" || providerError?.retryable === true;
    const partialText = (err as { partialText?: string }).partialText;
    await persistAssistantFailed({
      store: assistantPersistenceStore,
      conversationId,
      assistantMessageId: assistantMessage?.id,
      title: modeAwareFailureTitle(effectiveResearchMode, terminalStatus),
      message: `${message}\n\nSuggestions:\n- configure a working model provider\n- use Deep instead of PhD/FullSpectrum\n- reduce source requirement\n- retry`,
      partialContent: typeof partialText === "string" ? partialText : undefined,
      metadata: {
        runId,
        requestId,
        conversationId,
        assistantMessageId: assistantMessage?.id,
        queryHash: runIdentity.queryHash,
        researchMode: effectiveResearchMode,
        terminalStatus,
        status: terminalStatus,
        error: providerError ?? { code, message, recoverable },
        sourceUsageFailureReport: (err as any)?.sourceUsageFailureReport,
        providerErrors: providerError ? [providerError] : [],
        mode: effectiveResearchMode,
        models: [],
        discussion: null,
        sources: [],
      } as any,
    });
    sendRunEvent(terminalStatus, {
      type: terminalStatus,
      terminalStatus,
      error: providerError ?? { code, message, recoverable },
      code,
      message,
      retryable: recoverable,
      sourceUsageFailureReport: (err as any)?.sourceUsageFailureReport,
      providerErrors: providerError ? [providerError] : [],
      done: true,
    });
    writer.finishStream();
  } finally {
    const activeRun = activeResearchRunsByConversation.get(conversationId);
    if (activeRun?.identity.runId === runId) activeResearchRunsByConversation.delete(conversationId);
    clearTimeout(streamTimeout);
    clearInterval(heartbeatInterval);
  }
});

export default router;

