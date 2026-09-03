import { Router } from "express";
import {
  getArchiveContext,
  upsertArchiveContext,
  createMessage,
} from "../db.js";
import { getGroqClient } from "../lib/groq-client.js";
import { getOllamaClient } from "../lib/ollama-client.js";
import { getNvidiaClient } from "../lib/nvidia-client.js";
import { getGeminiClient, isGeminiEnabled } from "../lib/gemini-client.js";
import { getCerebrasClient, isCerebrasEnabled } from "../lib/cerebras-client.js";

import { classifyTopic, type TopicType } from "../lib/rag.js";
import { verifyAnswer, type VerifyClients } from "../lib/verify.js";
import { extractKeys, parseProviderModelId } from "../lib/provider-router.js";
import { createSseWriter } from "../lib/sse.js";
import type { RequestKeys } from "../lib/types.js";
import { logger } from "../lib/logger.js";
import { runResearchPipeline } from "../core/pipeline/research-pipeline.js";
import type { PipelineEvent, ResearchRunIdentity } from "../core/pipeline/pipeline-events.js";
import { stripPipelineMetadata } from "../core/pipeline/pipeline-metadata.js";
import { evaluateSourceContract } from "../core/evidence/source-contract.js";
import { agendaOutputDepthForMode, inferResearchMode } from "../core/config/research-mode.js";
import { buildAgendaContract } from "../core/agenda/agenda-contract.js";
import { buildBucketedQueryPlanWithExpansion } from "../core/retrieval/query-planning/build-query-plan.js";
import { runBucketedRetrieval } from "../core/retrieval/bucketed-retrieval.js";
import { runCouncilSession } from "../core/council/index.js";
import { buildResultSnapshot, decideRunTerminalStatus, normalizeProviderError, persistRunSnapshot, selectCanonicalRunTerminalStatus } from "../core/run-state/index.js";
import { TerminalWriteGuard } from "../core/streaming/run-stream/index.js";
import { getSourceUsagePolicy } from "../core/config/source-usage-policy.js";
import { buildArchiveContextText } from "./anthropic/archive-context-adapter.js";
import { buildCoreProviderRouter } from "./anthropic/core-provider-router.js";
import {
  buildCouncilFinalAnswer,
  buildCouncilMetadata,
  councilRetrievalSourceToEvidenceInput,
  __councilTestHooks,
} from "./anthropic/council-render.js";
import {
  DEFAULT_GROQ_MODEL,
  loadMessageRouteContext,
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

  const currentContext = await getArchiveContext(archiveId);

  const mergedSummary = await mergeArchiveSummaries(
    currentContext?.summary ?? existingSummary ?? "",
    distilled,
    {},
  );

  await upsertArchiveContext(archiveId, mergedSummary);
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
  maxOutputTokens = 8192
): Promise<string> {
  const stream = await client.chat.completions.create({
    model: modelId,
    max_tokens: maxOutputTokens,
    messages: [{ role: "system", content: systemPrompt }, ...messages.filter(m => m.role !== "system")],
    stream: true,
  });
  let fullResponse = "";
  for await (const chunk of stream) {
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
    modelId = parsedModel.modelId;
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
          ? `Selected model is unavailable: ${modelId}`
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

export async function streamRhetoricsResponse(
  client: any,
  systemPrompt: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  userQuery: string,
  temperature: number,
  send: (data: Record<string, unknown>) => void,
  keys: RequestKeys
): Promise<string> {
  let fullText = "";
  try {
    const stream = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1200,
      temperature,
      messages: [
        { role: "system" as const, content: systemPrompt },
        ...chatHistory.slice(-6),
        { role: "user" as const, content: userQuery },
      ],
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        send({ content: delta });
      }
    }
    // Parse debate suggestions out of fullText if present
    const sugMatch = fullText.match(/SUGGESTIONS:\s*(.+)/i);
    if (sugMatch) {
      const suggestions = sugMatch[1].split("|").map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
      if (suggestions.length > 0) send({ suggestions });
    }
    return fullText;
  } catch (err: any) {
    if (keys.geminiKey && isGeminiEnabled(keys.geminiKey)) {
      const gemini = getGeminiClient(keys.geminiKey);
      return streamGeminiResponse(
        gemini,
        "gemini-2.0-flash",
        systemPrompt,
        [...chatHistory.slice(-6), { role: "user" as const, content: userQuery }],
        send,
        1200
      );
    }
  }
  return fullText;
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
): Promise<void> {
  const writer = createSseWriter(res);
  const send = (data: Record<string, unknown>) => writer.sendEvent(data);
  const systemPrompt = [
    getRhetoricsSystemPrompt(type, temperature),
    archiveContextPrompt.trim(),
  ].filter(Boolean).join("\n\n");
  const topic = classifyTopic(userQuery);
  const client = getGroqClient(keys.groqKey);
  const fullText = await streamRhetoricsResponse(client, systemPrompt, chatHistory, userQuery, temperature, send, keys);
  if (fullText.trim()) {
    await createMessage(conversationId, "assistant", fullText);
    await mergeAssistantAnswerIntoArchiveContext(archiveId, archiveSummary, fullText, topic);
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
      const timeoutMessage = `Request timed out after ${Math.round(STREAM_TIMEOUT_MS / 60000)} minutes`;
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
    if (!(isGroq || isOllama || isNvidia || isGeminiModel || isOpenRouter || isGithubModel)) {
      writer.sendTerminalError({
        error: "Only groq/, ollama/, nvidia/, gemini/, openrouter/, and github/ model prefixes are supported.",
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
      const metadata = buildCouncilMetadata(runIdentity, councilSession, councilRetrieval, finalAnswer);
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
      });
      if (councilSession.terminalStatus === "cancelled") {
        await persistAssistantFailed({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage?.id,
          title: "Council Research Cancelled",
          message: "Council run was cancelled before completion.",
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
      // ── ANSWER GENERATION PROVIDER SELECTION ──────────────────────────────────────
      // The user's chat model selection (e.g., Groq) controls the UI display and
      // retrieval role models. However, core answer generation ALWAYS prefers Cerebras
      // internally (when its API key is configured), because Cerebras has the largest
      // prompt budget — ideal for the large, evidence-rich prompts the answer generator
      // builds. If Cerebras fails (key invalid, rate-limited, timeout, etc.), the system
      // falls back to other registered providers sorted by prompt budget size.
      // This is by design — the research answer generation is a separate pipeline from
      // the chat model the user picked in the UI.
      const userSelectedCoreModel = (effectiveWebModels[0] ?? rawNormalModel) || DEFAULT_GROQ_MODEL;
      // Build the router with the user-selected model so all providers get registered;
      // we override providerName/model below to use Cerebras for the primary generation call.
      const coreProvider = buildCoreProviderRouter(keys, userSelectedCoreModel);
      const cerebrasAvailable = isCerebrasEnabled(keys.cerebrasKey ?? null);
      // Override primary generation provider to Cerebras when available
      const resolvedProviderName = cerebrasAvailable ? "cerebras" as const : coreProvider.providerName;
      const resolvedModel = cerebrasAvailable ? "llama3.3-70b" : coreProvider.model;
      req.log?.info?.({
        event: "research_model_resolved",
        runId,
        conversationId,
        userSelectedCoreModel,
        resolvedProviderName,
        resolvedModel,
        cerebrasOverride: cerebrasAvailable,
        autoFallback,
      }, "research model resolved");
      if (coreProvider.error) {
        // If Cerebras is available, use it as fallback primary provider even when
        // the user-selected model's provider is misconfigured (missing key, etc.)
        if (cerebrasAvailable) {
          const fallbackProvider = buildCoreProviderRouter(keys, "cerebras/llama3.3-70b");
          if (!fallbackProvider.error) {
            Object.assign(coreProvider, fallbackProvider);
          }
        }
        // Still an error after Cerebras fallback attempt
        if (coreProvider.error) {
          sendRunEvent("provider_error", {
            providerError: coreProvider.error,
            providerConfigurationError: true,
            coreGenerationMode: "model_required",
            done: true,
          });
          await persistAssistantFailed({
            store: assistantPersistenceStore,
            conversationId,
            assistantMessageId: assistantMessage?.id,
            title: "Provider Error",
            message: `Provider configuration error: ${coreProvider.error}`,
            metadata: buildLegacyTerminalMetadata(runIdentity, "provider_error", {
              researchMode: effectiveResearchMode,
              liveRetrievalUsed: true,
              error: { code: "provider_configuration_error", message: coreProvider.error, recoverable: true },
            } as PipelineMetadata),
          });
          writer.finishStream();
          return;
        }
      }
      // Track how many tokens were streamed incrementally so we can avoid sending
      // the full answer again as a batch (which would duplicate content on the frontend).
      let streamedTokenCount = 0;
      const pipelineResult = await runResearchPipeline({
        runId,
        requestId,
        conversationId,
        assistantMessageId: assistantMessage?.id,
        userQuery: userContent,
        mode: effectiveResearchMode,
        archiveText: buildArchiveContextText(archiveTopic, archiveSummary),
        liveRetrieval: true,
        allowMockRetrieval: false,
        allowSyntheticSourceUsage: false,
        onStream: (chunk: string) => {
          streamedTokenCount++;
          sendRunEvent('answer_delta', { content: chunk });
        },
        searchOptions: {
          live: true,
          allowMock: false,
          mode: effectiveResearchMode,
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
        },
        generationMode: "model",
        providerRouter: coreProvider.router,
        providerName: resolvedProviderName,
        model: resolvedModel,
        userSelectedModels: effectiveWebModels,
        autoFallback,
        signal: requestAbortController.signal,
        trustRegisteredProvidersWithoutStatus: true,
        emit: (event: PipelineEvent) => {
          req.log?.info?.({
            runId,
            conversationId,
            corePipelineEvent: event.type,
            corePipelineData: event.data ?? {},
          }, "core research pipeline event");
          sendRunEvent("core_pipeline_event", {
            type: "core_pipeline_event",
            corePipelineEvent: event.type,
            corePipelineData: event.data ?? {},
          });
        },
      });
      const sourceUsagePolicy = getSourceUsagePolicy(effectiveResearchMode);
      const sourceUsageWarningRoles = pipelineResult.modelRoleOutputs.filter((role) => role.sourceUsageFailureReport);
      const sourceUsageFailedRoles = pipelineResult.modelRoleOutputs.filter((role) => !role.sourceUsageRequirementSatisfied);
      const sourceUsageFailureReports = [
        ...sourceUsageFailedRoles.map((role) => role.sourceUsageFailureReport).filter(Boolean),
        ...sourceUsageWarningRoles.map((role) => role.sourceUsageFailureReport).filter(Boolean),
      ];
      const providerErrors = sourceUsageFailureReports.flatMap((report) => report?.providerErrors ?? []);
      const citationStatus = {
        finalUniqueCitedSources: pipelineResult.citationReport.uniqueCitedSourceCount,
        totalLinkedCitations: pipelineResult.citationReport.linkedCitationCount,
        citedSourceIds: pipelineResult.citationReport.sourceIdsActuallyUsed,
        citationCoverage: pipelineResult.evidenceRegistry.getCitationEligibleCount() > 0
          ? pipelineResult.citationReport.uniqueCitedSourceCount / pipelineResult.evidenceRegistry.getCitationEligibleCount()
          : 0,
        invalidCitations: pipelineResult.citationReport.invalidCitations,
        citedBuckets: pipelineResult.citationReport.citedBuckets,
      };
      const strictSourceContract = evaluateSourceContract({
        mode: effectiveResearchMode,
        requiredSources: pipelineResult.agendaContract.minimumUniqueCitedSources,
        citationEligibleSources: pipelineResult.evidenceRegistry.getCitationEligibleCount(),
        finalUniqueCitedSources: pipelineResult.citationReport.uniqueCitedSourceCount,
        bucketCoverage: pipelineResult.evidenceRegistry.getBucketCoverage(),
        requiredBuckets: pipelineResult.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId),
        sourceGapReport: pipelineResult.sourceGapReport,
        categoryScores: pipelineResult.qualityGate.categoryScores,
      });
      const sourceContract = {
        ...strictSourceContract,
        requiredEvidenceCardsPerModel: pipelineResult.agendaContract.minimumEvidenceCardsPerModel,
        requiredUniqueCitedSources: pipelineResult.agendaContract.minimumUniqueCitedSources,
        citationEligibleSources: pipelineResult.evidenceRegistry.getCitationEligibleCount(),
        finalUniqueCitedSources: pipelineResult.citationReport.uniqueCitedSourceCount,
        passed: strictSourceContract.passed && (!sourceUsagePolicy.strictFailure || sourceUsageFailedRoles.length === 0),
        completedWithSourceGaps: strictSourceContract.status === "passed_with_source_gaps" || (!sourceUsagePolicy.strictFailure && (sourceUsageFailedRoles.length > 0 || sourceUsageWarningRoles.length > 0)),
        roles: pipelineResult.modelRoleOutputs.map((role) => ({
          roleName: role.roleName,
          sourceCountUsed: role.sourceUsageCount,
          passed: role.sourceUsageRequirementSatisfied,
          sourceGapReason: role.failureReason,
        })),
      };
      sendRunEvent("citation_status", { citationStatus });
      sendRunEvent("source_contract", { sourceContract });
      sendRunEvent("quality_gate", { coreQualityGate: pipelineResult.qualityGate });
      const terminalDecision = decideRunTerminalStatus({
        mode: effectiveResearchMode,
        coreGenerationUsed: pipelineResult.usedCoreGeneration,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        sourceContract: strictSourceContract,
        sourceGapReport: pipelineResult.sourceGapReport,
        qualityGate: pipelineResult.qualityGate,
        citationStatus,
        sourceUsageFailureReports,
        fallbackExplicitlyAllowed: false,
        degradedFallbackUsed: pipelineResult.coreAnswerResult?.degradedFallbackUsed === true,
        visibleAnswer: pipelineResult.finalAnswer,
      });
      const terminalStatus = selectCanonicalRunTerminalStatus(terminalDecision, pipelineResult.terminalStatus);
      const snapshot = buildResultSnapshot({
        runIdentity,
        finalAnswer: terminalDecision.visibleAnswer || stripPipelineMetadata(pipelineResult.finalAnswer).trim(),
        terminalStatus,
        errorCode: terminalDecision.errorCode,
        error: terminalDecision.errorCode
          ? { code: terminalDecision.errorCode, message: "Final answer was empty after hidden metadata was stripped.", stage: "final_output", retryable: true }
          : undefined,
        sources: pipelineResult.evidenceRegistry.sources.map((source) => ({
          sourceId: source.id,
          title: source.title,
          url: source.url,
          sourceType: source.sourceClass,
          bucketIds: source.bucketIds,
          discoveredBy: source.discoveredBy,
          extractedBy: source.extractedBy,
          fallbackExtractionUsed: source.fallbackExtractionUsed,
        })),
        citationReport: citationStatus,
        sourceContract: strictSourceContract,
        sourceGapReport: pipelineResult.sourceGapReport,
        qualityGateReport: pipelineResult.qualityGate,
        sourceUsageValidationReports: sourceUsageFailureReports,
        divisionOutputs: pipelineResult.divisionOutputs,
        providerRuntime: {
          providerErrors,
        },
        bucketCoverage: pipelineResult.evidenceRegistry.getBucketCoverage(),
        agenda: {
          normalizedAgenda: pipelineResult.agendaContract.normalizedAgenda,
          topicType: pipelineResult.agendaContract.topicType,
          minimumUniqueCitedSources: pipelineResult.agendaContract.minimumUniqueCitedSources,
        },
        degradedFallbackUsed: pipelineResult.coreAnswerResult?.degradedFallbackUsed,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        fallbackUsed: pipelineResult.fallbackUsed,
        fallbackReason: pipelineResult.fallbackReason,
        fallbackCode: pipelineResult.fallbackCode,
      });
      if (terminalStatus === "failed" || terminalStatus === "provider_error") {
        const failureMessage = sourceUsageFailedRoles.length > 0
          ? "Source usage validation failed. The model listed sources without extracting/supporting claims."
          : terminalDecision.errorCode === "EMPTY_FINAL_ANSWER"
            ? "Final answer was empty after hidden metadata was stripped."
          : pipelineResult.qualityGate.repairRequired
            ? "Research quality gate failed after repair."
            : "Research source contract failed.";
        await persistAssistantFailed({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage?.id,
          title: modeAwareFailureTitle(effectiveResearchMode, terminalStatus),
          message: failureMessage,
          metadata: {
            runId,
            requestId,
            conversationId,
            assistantMessageId: assistantMessage?.id,
            queryHash: runIdentity.queryHash,
            researchMode: effectiveResearchMode,
            terminalStatus,
            coreGenerationUsed: pipelineResult.usedCoreGeneration,
            legacyFallbackUsed: pipelineResult.usedLegacyFallback,
            liveRetrievalUsed: true,
            error: { code: terminalDecision.errorCode ?? "SOURCE_CONTRACT_FAILED", message: failureMessage, recoverable: true },
            sourceUsageFailureReports,
            providerErrors,
            sourceContract: strictSourceContract,
            sourceGapReport: pipelineResult.sourceGapReport,
            qualityGate: pipelineResult.qualityGate,
            citationStatus,
            citationReport: snapshot.citationReport,
            divisionOutputs: snapshot.divisionOutputs,
            qualityGateReport: snapshot.qualityGateReport,
            sources: snapshot.sources,
          } as any,
        });
        sendRunEvent("failed", {
          done: true,
          terminalStatus,
          code: terminalDecision.errorCode ?? (sourceUsageFailedRoles.length > 0 ? "SOURCE_USAGE_VALIDATION_FAILED" : "SOURCE_CONTRACT_FAILED"),
          message: failureMessage,
          retryable: true,
          sourceContract,
          sourceGapReport: pipelineResult.sourceGapReport,
          sourceUsageFailureReports,
          divisionOutputs: snapshot.divisionOutputs,
          diagnostics: { citationReport: snapshot.citationReport, qualityGateReport: snapshot.qualityGateReport },
        });
        writer.finishStream();
        return;
      }
      // Only send the full answer as a batch if NO tokens were streamed incrementally.
      // When streaming worked, the frontend already has the complete text from accumulated
      // answer_delta chunks — sending it again would duplicate the content.
      if (streamedTokenCount === 0) {
        sendRunEvent("answer_delta", { content: pipelineResult.finalAnswer });
      }
      sendRunEvent("division_outputs", { divisionOutputs: snapshot.divisionOutputs });
      sendRunEvent(terminalStatus, {
        done: true,
        terminalStatus,
        coreGenerationUsed: pipelineResult.usedCoreGeneration,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        liveRetrievalUsed: true,
        sourceGapReport: pipelineResult.sourceGapReport,
        sourceUsageFailureReports: sourceUsageWarningRoles.map((role) => role.sourceUsageFailureReport).filter(Boolean),
        citationReport: snapshot.citationReport,
        qualityGateReport: snapshot.qualityGateReport,
        sourceContract: snapshot.sourceContract,
        divisionOutputs: snapshot.divisionOutputs,
        sources: snapshot.sources,
      });
      const persistedMetadata = {
        runId,
        requestId,
        conversationId,
        assistantMessageId: assistantMessage?.id,
        queryHash: runIdentity.queryHash,
        researchMode: effectiveResearchMode,
        terminalStatus,
        coreGenerationUsed: pipelineResult.usedCoreGeneration,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        liveRetrievalUsed: true,
        sourceContract: strictSourceContract,
        sourceGapReport: pipelineResult.sourceGapReport,
        qualityGate: pipelineResult.qualityGate,
        citationStatus,
        sourceUsageFailureReports,
        providerErrors,
        degradedFallbackUsed: pipelineResult.coreAnswerResult?.degradedFallbackUsed,
        deterministicCitedFallbackUsed: pipelineResult.coreAnswerResult?.deterministicCitedFallbackUsed,
        citationRepairAttempted: pipelineResult.coreAnswerResult?.citationRepairAttempted,
        citationRepairSucceeded: pipelineResult.coreAnswerResult?.citationRepairSucceeded,
        divisionOutputs: snapshot.divisionOutputs,
        citationReport: snapshot.citationReport,
        qualityGateReport: snapshot.qualityGateReport,
        sourceUsageValidationReports: sourceUsageFailureReports,
        repairPasses: [],
        bucketCoverage: pipelineResult.evidenceRegistry.getBucketCoverage(),
        legacyDebug: { mode: effectiveResearchMode, models: [], discussion: null },
        sources: snapshot.sources,
      } as any;
      const persistedContent = embedPipelineMeta(snapshot.finalAnswer, persistedMetadata);
      if (assistantMessage?.id) {
        await persistRunSnapshot({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage.id,
          snapshot,
        });
        if (!clientDisconnected) {
          await maybeMergeArchive({
            terminalStatus,
            qualityGate: pipelineResult.qualityGate,
            legacyFallbackUsed: pipelineResult.usedLegacyFallback,
            sourceContract: strictSourceContract,
            finalAnswer: pipelineResult.finalAnswer,
            merge: () => mergeAssistantAnswerIntoArchiveContext(archiveId, archiveSummary, pipelineResult.finalAnswer, classifyTopic(userContent)),
          });
        }
      }
      writer.finishStream();
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
    await persistAssistantFailed({
      store: assistantPersistenceStore,
      conversationId,
      assistantMessageId: assistantMessage?.id,
      title: modeAwareFailureTitle(effectiveResearchMode, terminalStatus),
      message: `${message}\n\nSuggestions:\n- configure a working model provider\n- use Deep instead of PhD/FullSpectrum\n- reduce source requirement\n- retry`,
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

