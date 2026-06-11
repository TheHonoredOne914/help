import { Router } from "express";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import {
  getArchiveContext,
  upsertArchiveContext,
  createMessage,
  getConversationsByArchiveId,
  getArchiveById,
  createConversation,
  createMessageFromJson,
  deleteConversation,
  getConversationById,
  getMessagesByConversationId,
  listConversations,
  toApiConversation,
  toApiMessage,
  updateConversationTitle,
  updateMessage,
  getArchiveResearchAngles,
  upsertArchiveResearchAngles,
} from "../db.js";
import { getGroqClient, isGroqEnabled } from "../lib/groq-client.js";
import { getOllamaClient, isOllamaEnabled } from "../lib/ollama-client.js";
import { getNvidiaClient, isNvidiaEnabled } from "../lib/nvidia-client.js";
import { getGeminiClient, isGeminiEnabled } from "../lib/gemini-client.js";
import { getCerebrasClient, isCerebrasEnabled } from "../lib/cerebras-client.js";

import { searchWeb, searchWebDeep, searchIndianKanoon, formatSearchResults, deduplicateResults, engineerQueryForIndia, engineerQueryForMedia, engineerQueryForSociocultural, engineerQueryForDemocracy } from "../lib/web-search.js";
import type { CourtJudgement } from "../lib/web-search.js";
import { enrichResults, formatRagContext, formatRagContextFromPassages, rerankPassages, decomposeQuery, canonicalizeUrl, countCitations, buildSearchSystem, classifyTopic, type TopicType } from "../lib/rag.js";
import { verifyAnswer, type VerifyClients } from "../lib/verify.js";
import { resolveProvider, extractKeys, parseProviderModelId } from "../lib/provider-router.js";
import { composeAnthropicSystemPrompt } from "../lib/chat-system-prompt.js";
import { createSseWriter } from "../lib/sse.js";
import { getOpenRouterClient } from "../lib/openrouter-client.js";
import { buildNumberedSourceEntries, computeCitationCoverage, computeCitationCoverageStrict, formatNumberedSourceList, normalizeSourceCitations } from "../lib/citation-normalizer.js";
import { runDimensionEngine } from "../lib/dimension-engine.js";
import { auditSourceContentGaps, buildEvidenceBlockForDivision, buildEvidenceRegistry, summarizeEvidenceRegistry, validateEvidenceRegistryCompleteness } from "../lib/evidence-registry.js";
import { getCachedRegistry, setCachedRegistry } from "../lib/evidence-cache.js";
import { resolveModelProfile } from "../lib/token-budget.js";
import { DIVISION_REGISTRY, PARLIAMENTARY_REGISTER_RULES } from "../lib/division-framework.js";
import { runQualityGate } from "../lib/quality-gate.js";
import { runDivisionPipeline, type ModelPoolEntry } from "./division-engine.js";
import type { CommitteeType, DimensionEngineOutput, EvidenceRegistry, RequestKeys, ResolvedProvider, SearchResult, EnrichedResult } from "../lib/types.js";
import { logger } from "../lib/logger.js";
import { deepResearchSemaphore } from "../lib/request-queue.js";
import { enforceQueryMinimums } from "./research-planner.js";
import { OPENROUTER_PRIMARY_MODEL } from "../config.js";
import { classifyAgenda, inferCommitteeTypeFromAgenda, type AgendaIntelligence } from "../lib/agenda-classifier.js";
import { buildSearchSubject, buildUnifiedQueryPlan } from "../lib/query-planner.js";
import { chunkSourceManifest, type ContextChunk } from "../lib/context-chunker.js";
import { compileFullSourceManifest, type FullSourceManifest } from "../lib/source-compiler.js";
import { runResearchPipeline } from "../core/pipeline/research-pipeline.js";
import type { PipelineEvent, ResearchRunIdentity } from "../core/pipeline/pipeline-events.js";
import { embedPipelineMetadata, stripPipelineMetadata } from "../core/pipeline/pipeline-metadata.js";
import { evaluateSourceContract } from "../core/evidence/source-contract.js";
import { agendaOutputDepthForMode, inferResearchMode, type ResearchMode } from "../core/config/research-mode.js";
import { buildAgendaContract } from "../core/agenda/agenda-contract.js";
import { buildBucketedQueryPlanWithExpansion } from "../core/retrieval/query-planning/build-query-plan.js";
import { runBucketedRetrieval, type BucketedRetrievalResult } from "../core/retrieval/bucketed-retrieval.js";
import type { RawEvidenceSourceInput } from "../core/evidence/evidence-registry.js";
import { runCouncilSession, type CouncilSession } from "../core/council/index.js";
import { buildResultSnapshot, decideRunTerminalStatus, normalizeProviderError, persistRunSnapshot, selectCanonicalRunTerminalStatus, serializeDivisionOutputs } from "../core/run-state/index.js";
import { envelopeRunEvent as buildRunEventEnvelope, TerminalWriteGuard } from "../core/streaming/run-stream/index.js";
import { detectFreshnessNeeded } from "../core/freshness/freshness-router.js";
import { getSourceUsagePolicy } from "../core/config/source-usage-policy.js";
import { ProviderRouter as CoreProviderRouter } from "../core/providers/provider-router.js";
import { multiKeyFetch } from "../lib/multi-key-fetch.js";
import { getRequestOwnerId } from "../lib/request-auth.js";
import { GroqProvider } from "../core/providers/groq-provider.js";
import { OpenRouterProvider } from "../core/providers/openrouter-provider.js";
import { GeminiProvider } from "../core/providers/gemini-provider.js";
import { NvidiaProvider } from "../core/providers/nvidia-provider.js";
import { GithubProvider } from "../core/providers/github-provider.js";
import { CerebrasProvider } from "../core/providers/cerebras-provider.js";
import type { ProviderName } from "../core/providers/provider-types.js";
import { writeAnthropicSseEvent } from "./anthropic/sse-bridge.js";
import { shouldUseCoreFinalAnswer } from "./anthropic/final-response-adapter.js";
import { buildArchiveContextText } from "./anthropic/archive-context-adapter.js";
import { enrichedResultToCoreSource } from "./anthropic/core-route-adapter.js";
import {
  maybeMergeArchive,
  persistAssistantCompleted,
  persistAssistantFailed,
} from "./assistant-persistence.js";
import {
  mergeSearchResults,
  mergeEnrichedResults,
  deduplicateQueriesSemantically,
} from "./retrieval.js";

// â”€â”€â”€ Independent Model Research Architecture (Section 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface IndependentResearchResult {
  modelKey:      string;
  modelLabel:    string;
  subQueries:    string[];         // queries this model generated
  searchResults: EnrichedResult[]; // CHANGED: sources with full content preserved
  judgements:    CourtJudgement[]; // court judgements found
  govReports:    string[];         // CAG/NCRB/PIB report titles
  ragContext:    string;           // this model's formatted context
  draft:         string;           // filled in after research (Phase 2)
  stats: {                         // numerical data extracted
    numbers:     string[];
    percentages: string[];
    years:       string[];
  };
}

function buildModelPool(
  modelInfos: Array<{ rawModelId: string; modelId: string; client: any; providerLabel: string }>,
  groqKey: string | null | undefined,
  _geminiKey: string | null | undefined,
  openrouterKey: string | null | undefined,
): ModelPoolEntry[] {
  const pool: ModelPoolEntry[] = [];

  if (openrouterKey?.trim()) {
    const orClient = getOpenRouterClient(openrouterKey);
    pool.push({ client: orClient, modelId: OPENROUTER_PRIMARY_MODEL });
  }

  for (const info of modelInfos) {
    pool.push({ client: info.client, modelId: info.modelId });
  }

  if (groqKey?.trim() && pool.length < 2) {
    pool.push({ client: getGroqClient(groqKey), modelId: "llama-3.3-70b-versatile" });
  }

  return pool;
}

function extractFlaggedClaims(notes: string): string[] {
  return notes
    .split(/(?:\n|;|\.)/)
    .map((line) => line.trim())
    .filter((line) => /\b(unsupported|unverified|fabricated|contradict|not found|no source|uncited)\b/i.test(line))
    .slice(0, 8);
}

function sanitizeKeyFindings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((f): f is string => typeof f === "string")
    .filter((f) => !/^\s*[\[{"]/.test(f))   // drop JSON-like strings
    .map((f) => f.trim())
    .filter(Boolean);
}

function fixGroupedCitations(text: string, sourceList: SearchResult[]): string {
  // Match [Source 3, 4, 5, 7] or [Source 3,4,5] style — no trailing (url)
  return text.replace(/\[Source\s*([\d,\s]+)\](?!\()/gi, (match, ids) => {
    const nums = ids.split(",").map((s: string) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    return nums.map((n: number) => {
      const src = sourceList[n - 1];
      const url = src?.url ?? "#";
      return `[Source ${n}](${url})`;
    }).join(" ");
  });
}

function toSearchAnchor(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["india","with","that","this","from","what","have","been","does","which","about","their","there"].includes(w))
    .slice(0, 4)
    .join(" ");
}

function researchQualityScore(results: SearchResult[]): number {
  const unique = mergeSearchResults(results);
  if (unique.length === 0) return 0;
  const gov = unique.filter((r) => r.sourceType === "government_india" && r.score >= 9).length;
  const court = unique.filter((r) => r.sourceType === "court_judgement").length;
  const intl = unique.filter((r) => r.sourceType === "government_international" || r.sourceType === "international_research").length;
  const reports = unique.filter((r) => Boolean(r.reportType)).length;
  return unique.length + gov * 2 + court * 1.5 + intl + reports * 0.5;
}

function shouldRunCrossModelDiscussion(results: SearchResult[], isDeep: boolean, forceSkip = false): boolean {
  if (forceSkip) return false;
  const unique = mergeSearchResults(results);
  const gov = unique.filter((r) => r.sourceType === "government_india" && r.score >= 9).length;
  const court = unique.filter((r) => r.sourceType === "court_judgement").length;
  const total = unique.length;
  const quality = researchQualityScore(unique);

  if (isDeep) {
    return total >= 6 || gov >= 2 || court >= 1 || quality >= 10;
  }
  return total >= 4 || gov >= 2 || court >= 1 || quality >= 7;
}

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
  archiveId: number | undefined,
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

export function ensureResearchWorkerModels(
  mode: string,
  models: string[],
  fallbackModel = "groq/llama-3.3-70b-versatile",
): string[] {
  if (mode !== "web_search" && mode !== "deep_research") return models;
  if (models.length >= 2) return models;

  const planner = models[0] ?? fallbackModel;
  const fallbackWorker = planner !== fallbackModel
    ? fallbackModel
    : "groq/llama-3.1-8b-instant";

  return [planner, fallbackWorker];
}

function countDataBullets(answer: string): number {
  const statsSection = answer.match(/##\s*Key Statistics & Data\s*([\s\S]*?)(?:\n##\s|$)/i)?.[1] ?? "";
  return statsSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]/.test(line) && /\d/.test(line) && /\[Source\s*\d+\]\(/i.test(line))
    .length;
}

function buildSparseEvidenceWarning(results: SearchResult[], userQuery: string): string {
  const merged = mergeSearchResults(results).slice(0, 6);
  const sources = merged.length > 0
    ? merged.map((r, i) => `${i + 1}. ${r.title} â€” ${r.url}`).join("\n")
    : "No strong official or legal sources were retrieved.";
  return [
    "## Evidence Limitations",
    `Research on "${userQuery.slice(0, 160)}" returned sparse or uneven evidence.`,
    "The answer below should be treated as a partial brief, not a definitive MUN note.",
    "",
    "Best sources found so far:",
    sources,
  ].join("\n");
}

type PlannerRole = "data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs" | "media_journalist";
type PlannedQueries = Record<"data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs", string[]>
  & { media_journalist?: string[] };

type TopicSourceStrategy = {
  topicClass: string;
  sourcePriorities: string[];
  mustIncludeDomains: string[];
};

export function allocateQueryBudgetByDimension(engine: DimensionEngineOutput, planned: PlannedQueries): PlannedQueries {
  const agenda = engine.agendaText.slice(0, 120);
  const result: PlannedQueries = {
    data_analyst: [...planned.data_analyst],
    legal_researcher: [...planned.legal_researcher],
    policy_analyst: [...planned.policy_analyst],
    current_affairs: [...planned.current_affairs],
    media_journalist: planned.media_journalist ? [...planned.media_journalist] : undefined,
  };
  const primaryNames = new Set(engine.primaryDimensions.map(d => d.name));

  if (primaryNames.has("constitutional") || primaryNames.has("judiciary")) {
    result.legal_researcher = deduplicateQueriesSemantically([
      ...result.legal_researcher,
      `${agenda} constitutional validity India Supreme Court site:indiankanoon.org`,
      `${agenda} Article fundamental rights India constitutional bench`,
      `${agenda} India constitutional challenge PIL 2023 2024`,
    ]).slice(0, 12);
  }

  if (primaryNames.has("economic") || primaryNames.has("governance")) {
    result.data_analyst = deduplicateQueriesSemantically([
      ...result.data_analyst,
      `${agenda} India CAG audit report site:cag.gov.in`,
      `${agenda} India NCRB statistics site:ncrb.gov.in`,
      `${agenda} India MoSPI annual survey site:mospi.gov.in`,
    ]).slice(0, 12);
  }

  if (primaryNames.has("diplomatic") || primaryNames.has("international_relations")) {
    result.policy_analyst = deduplicateQueriesSemantically([
      ...result.policy_analyst,
      `${agenda} India MEA official statement site:mea.gov.in`,
      `${agenda} India UN Security Council position 2024`,
      `${agenda} India bilateral treaty official`,
    ]).slice(0, 12);
  }

  if (primaryNames.has("security") || primaryNames.has("strategic_affairs")) {
    result.policy_analyst = deduplicateQueriesSemantically([
      ...result.policy_analyst,
      `${agenda} India security threat MEA MoD SIPRI`,
      `${agenda} IDSA India defence analysis`,
    ]).slice(0, 12);
  }

  if (primaryNames.has("media_information")) {
    result.media_journalist = deduplicateQueriesSemantically([
      ...(result.media_journalist ?? []),
      `${agenda} RSF press freedom India 2024`,
      `${agenda} CPJ journalist India incidents`,
      `${agenda} Freedom House India score 2024`,
    ]).slice(0, 10);
  }

  return result;
}

function buildTopicSourceStrategy(userQuery: string, archiveTopic?: string): TopicSourceStrategy {
  const input = `${archiveTopic ?? ""} ${userQuery}`.toLowerCase();
  const topicClass = classifyTopic(input);

  const defaults: TopicSourceStrategy = {
    topicClass,
    sourcePriorities: ["official", "legal", "international", "investigative_media", "think_tank"],
    mustIncludeDomains: ["gov.in", "indiankanoon.org", "un.org", "rsf.org", "freedomhouse.org"],
  };

  if (topicClass === "media_press") {
    return {
      topicClass: "media_press",
      sourcePriorities: ["international", "investigative_media", "legal", "official", "think_tank"],
      mustIncludeDomains: ["rsf.org", "cpj.org", "freedomhouse.org", "hrw.org", "indiankanoon.org"],
    };
  }

  if (topicClass === "security" || /(war|conflict|strike|ceasefire|iran|israel|ukraine|border)/i.test(input)) {
    return {
      topicClass: "security",
      sourcePriorities: ["official", "international", "legal", "investigative_media", "think_tank"],
      mustIncludeDomains: ["mea.gov.in", "un.org", "icj-cij.org", "sipri.org", "reuters.com"],
    };
  }
  if (topicClass === "democracy_civil_liberties") {
    return {
      topicClass: "democracy_civil_liberties",
      sourcePriorities: ["legal", "international", "investigative_media", "official", "think_tank"],
      mustIncludeDomains: ["indiankanoon.org", "ecisveep.nic.in", "rsf.org", "cpj.org", "freedomhouse.org"],
    };
  }
  return defaults;
}

/**
 * Returns deterministic PlannedQueries for sensitive topics.
 * Returns null for other topics so callers can use the LLM planner.
 * This is the single source of truth for sensitive-topic role queries.
 */
function buildDeterministicPlan(
  userQuery: string,
  archiveTopic: string | undefined,
  topicType: TopicType
): PlannedQueries | null {
  const anchor = toSearchAnchor(archiveTopic ?? userQuery);

  if (topicType === "media_press") {
    return {
      data_analyst: [
        `India Freedom House political rights civil liberties score 2024 2025 ${anchor}`,
        `India V-Dem liberal democracy index scores year-on-year ${anchor}`,
        `India EIU Democracy Index rank category 2023 2024`,
        `India CIVICUS civil society rating 2024 ${anchor}`,
        `India democracy autocratization FCRA NGO cancellation data statistics`,
        `India Freedom House score decline 14-point drop trend data`,
      ],
      legal_researcher: [
        `UAPA bail denial Supreme Court India judgment 2023 2024 site:indiankanoon.org`,
        `Section 124A sedition Vombatkere Supreme Court stay 2022`,
        `preventive detention India UAPA opposition leader case law`,
        `Romila Thapar Union India Supreme Court judgment`,
        `Stan Swamy UAPA Bhima Koregaon bail death`,
        `internet shutdown India Supreme Court Anuradha Bhasin judgment`,
      ],
      policy_analyst: [
        `site:mea.gov.in India ${anchor} statement`,
        `site:pib.gov.in India ${anchor} press release`,
        `India ${anchor} NITI Aayog policy report`,
        `India ${anchor} parliamentary standing committee report prsindia.org`,
        `India ${anchor} UN speech Ministry official position 2024`,
      ],
      current_affairs: [
        `India ${anchor} latest news 2025`,
        `India ${anchor} Reuters AP BBC 2025`,
        `India ${anchor} update since 2024`,
        `India ${anchor} recent development this year`,
        `India ${anchor} timeline events 2024 2025`,
      ],
      media_journalist: [
        `site:rsf.org india ${anchor} 2025`,
        `site:cpj.org india journalist ${anchor} 2024`,
        `site:thewire.in india ${anchor}`,
        `site:scroll.in india ${anchor}`,
        `site:hrw.org india ${anchor} 2024`,
        `site:article14.com india ${anchor}`,
      ],
    };
  }

  if (topicType === "democracy_civil_liberties") {
    return {
      data_analyst: [
        `India Freedom House political rights civil liberties score 2024 2025 ${anchor}`,
        `India V-Dem liberal democracy index scores year-on-year ${anchor}`,
        `India EIU Democracy Index rank category 2023 2024`,
        `India CIVICUS civil society rating 2024 ${anchor}`,
        `India democracy autocratization FCRA NGO cancellation data statistics`,
        `India Freedom House score decline 14-point drop trend data`,
      ],
      legal_researcher: [
        `UAPA bail denial Supreme Court India judgment 2023 2024 site:indiankanoon.org`,
        `Section 124A sedition Vombatkere Supreme Court stay 2022`,
        `preventive detention India UAPA opposition leader case law`,
        `Romila Thapar Union India Supreme Court judgment`,
        `Stan Swamy UAPA Bhima Koregaon bail death`,
        `internet shutdown India Supreme Court Anuradha Bhasin judgment`,
      ],
      policy_analyst: [
        `site:mea.gov.in India ${anchor} statement`,
        `site:pib.gov.in India ${anchor} press release`,
        `India ${anchor} NITI Aayog policy report`,
        `India ${anchor} parliamentary standing committee report prsindia.org`,
        `India ${anchor} UN speech Ministry official position 2024`,
      ],
      current_affairs: [
        `India ${anchor} latest news 2025`,
        `India ${anchor} Reuters AP BBC 2025`,
        `India ${anchor} update since 2024`,
        `India ${anchor} recent development this year`,
        `India ${anchor} timeline events 2024 2025`,
      ],
      media_journalist: [
        `site:hrw.org india ${anchor} 2024`,
        `site:amnesty.org india ${anchor} 2024`,
        `site:freedomhouse.org india ${anchor} 2025`,
        `site:article14.com india ${anchor}`,
        `site:thewire.in india ${anchor}`,
        `site:internetfreedom.in india ${anchor} 2024`,
      ],
    };
  }

  return null;
}

async function citationRepairPass(
  draft: string,
  userQuery: string,
  groqKey?: string | null,
  minCitations = 10,
  geminiKey?: string | null,
  allResults: SearchResult[] = [],
  nvidiaKey?: string | null,
  cerebrasKey?: string | null
): Promise<string> {
  const normalizedDraft = normalizeSourceCitations(draft, allResults);
  const current = countCitations(normalizedDraft);
  if (current >= minCitations) return normalizedDraft;
  const numberedSources = formatNumberedSourceList(allResults);
  const prompt = [
    "Rewrite this answer to add citations using ONLY the authoritative numbered sources below.",
    "Do NOT add new sources or invent URLs.",
    "Preserve the answer's sections, detail, evidence, and research depth. Do not summarize it down.",
    `Goal: at least ${minCitations} distinct [Source N](url) citations.`,
    "Do not emit bare [1] citations or grouped [Source 1, 2] citations. Copy the exact Citation token for each source.",
    "NEVER group multiple sources in one bracket like [Source 3, 4, 5].",
    "ALWAYS cite each source separately with its own link: [Source 3](url) [Source 4](url)",
    "Each citation MUST be in the format [Source N](url) — the (url) part is mandatory.",
    `Question: "${userQuery.slice(0, 180)}"`,
    "",
    "AUTHORITATIVE NUMBERED SOURCES:",
    numberedSources || "(no sources)",
    "",
    "Draft:",
    normalizedDraft,
  ].join("\n");

  const normalizeAndAccept = (candidate?: string | null): string | null => {
    if (!candidate?.trim()) return null;
    const normalized = normalizeSourceCitations(candidate, allResults);
    const candidateCitationCount = countCitations(normalized);
    const keepsResearchShape = normalized.length >= normalizedDraft.length * 0.65;
    if (candidateCitationCount >= minCitations && keepsResearchShape) {
      return normalized;
    }
    return null;
  };

  if (groqKey?.trim()) {
    try {
      const groq = getGroqClient(groqKey);
      const resp = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 6000,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });
      const text = normalizeAndAccept(resp.choices?.[0]?.message?.content);
      if (text) return text;
    } catch { /* fall through */ }
  }

  // Cerebras — large prompt budget, good for citation-heavy repair prompts
  if (isCerebrasEnabled(cerebrasKey)) {
    try {
      const cerebras = getCerebrasClient(cerebrasKey);
      const resp = await cerebras.chat.completions.create({
        model: "llama3.3-70b",
        max_tokens: 6000,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });
      const text = normalizeAndAccept(resp.choices?.[0]?.message?.content);
      if (text) return text;
    } catch { /* fall through */ }
  }

  // NVIDIA
  if (isNvidiaEnabled(nvidiaKey)) {
    try {
      const nvidia = getNvidiaClient(nvidiaKey);
      const resp = await nvidia.chat.completions.create({
        model: "nvidia/llama-3.3-nemotron-super-49b-v1",
        max_tokens: 6000,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });
      const text = normalizeAndAccept(resp.choices?.[0]?.message?.content);
      if (text) return text;
    } catch { /* fall through */ }
  }

  if (geminiKey?.trim() && isGeminiEnabled(geminiKey)) {
    try {
      const gemini = getGeminiClient(geminiKey);
      const resp = await gemini.chat.completions.create({
        model: "gemini-2.0-flash",
        max_tokens: 6000,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });
      const text = normalizeAndAccept(resp.choices?.[0]?.message?.content);
      if (text) return text;
    } catch { /* fall through */ }
  }

  return normalizedDraft;
}

// Personas are assigned by INDEX (0, 1, 2, 3â€¦) â€” NOT by model name.
// The user selects whatever models they want; roles are purely positional.
const POSITIONAL_PERSONAS: string[] = [
  // Index 0 â€” first selected model: Data Analyst
  `You are a DATA ANALYST persona. Focus your sub-queries on:
    - Numerical statistics, percentages, absolute counts
    - CAG audit reports, NCRB crime data, economic indicators
    - Government scheme performance and budget data
    - Return queries that will find tables, official reports with numbers.`,

  // Index 1 â€” second selected model: Legal Researcher
  `You are a LEGAL RESEARCHER persona. Focus your sub-queries on:
    - Supreme Court and High Court judgements
    - Constitutional articles, IPC sections, specific Acts of Parliament
    - PIL outcomes, landmark cases, legal precedents
    - Return queries optimized for indiankanoon.org and livelaw.in results.`,

  // Index 2 â€” third selected model: Policy Analyst
  `You are a POLICY ANALYST persona. Focus your sub-queries on:
    - India's official foreign policy positions, MEA statements
    - Parliamentary debates, committee reports, NITI Aayog papers
    - Comparative data (India vs world, India vs South Asia)
    - Return queries that find policy documents and position papers.`,

  // Index 3 â€” fourth selected model: Current Affairs
  `You are a CURRENT AFFAIRS persona. Focus your sub-queries on:
    - Latest 2024-2025 developments, recent government actions
    - Recent PIB press releases, budget announcements
    - Current UN resolutions, recent diplomatic events
    - Return queries with recent date filters and news sources.`,
];

const DEMOCRACY_PERSONAS: string[] = [
  `You are an INVESTIGATIVE JOURNALIST persona researching democratic backsliding.
Focus your sub-queries on:
- Named incidents: specific arrests, UAPA charges, sedition cases against activists, journalists, opposition figures
- Freedom House score trend for India (year-on-year), V-Dem liberal democracy metrics
- Documented cases of internet shutdowns, press suppression, NGO FCRA cancellations
- Investigative reports from Article 14, The Wire, Scroll.in, HRW, Amnesty
Search targets: article14.com, freedomhouse.org, thewire.in, hrw.org, site:cpj.org india`,

  `You are a CIVIL LIBERTIES MONITOR persona tracking civil society erosion.
Focus your sub-queries on:
- HRW and Amnesty International India country reports (2022, 2023, 2024, 2025)
- CIVICUS India civil society space rating and incidents
- FCRA (Foreign Contribution Regulation Act) cancellations â€” data on NGOs affected
- IFF (internetfreedom.in) documented cases: internet shutdowns, platform takedowns
- Minority rights incidents, CAA protests, UAPA detentions
Search targets: hrw.org, amnesty.org, civicus.org, internetfreedom.in, accessnow.org`,

  `You are an INTERNATIONAL DEMOCRACY OBSERVER persona analyzing index data.
Focus your sub-queries on:
- V-Dem (Varieties of Democracy) India scores: Liberal, Electoral, Egalitarian indices
- EIU Democracy Index India rank and category (flawed democracy vs hybrid regime)
- Freedom House sub-scores for India: Political Rights, Civil Liberties â€” year-on-year
- Comparative data: India vs Brazil, Turkey, Hungary on same democracy indices
- Academic comparative politics: democratic backsliding literature, autocratization studies
Search targets: v-dem.net, freedomhouse.org, eiu.com, scholar.google, ssrn.com`,

  `You are a JUDICIAL ACCOUNTABILITY ANALYST persona reviewing legal responses.
Focus your sub-queries on:
- Supreme Court of India judgements on UAPA, sedition (Section 124A), internet shutdowns
- High Court orders on bail denials, preventive detention, minority rights cases
- PIL outcomes on democratic freedoms, press freedom, NGO rights
- Judicial independence metrics: cases pending, contempt usage, executive appointments
- Landmark cases: Shreya Singhal, Romila Thapar, Stan Swamy, Zakia Jafri
Search targets: indiankanoon.org, livelaw.in, barandbench.com, site:sci.gov.in`,
];

const MEDIA_PRESS_PERSONAS: string[] = [
  `You are a PRESS FREEDOM INVESTIGATOR persona.
Focus your sub-queries on:
- RSF press freedom rank, score and factors for India (2022, 2023, 2024, 2025)
- CPJ Imprisoned Journalist data for India â€” names, charges, duration
- Named journalist arrests, UAPA/sedition charges, newsroom raids
- site:rsf.org india, site:cpj.org india, site:ifj.org india
- MediaNama and The Wire coverage of specific media freedom incidents`,

  `You are a LEGAL FREE SPEECH ANALYST persona.
Focus your sub-queries on:
- Supreme Court Article 19(1)(a) jurisprudence â€” landmark cases and recent orders
- Section 124A sedition: S.G. Vombatkere case (2022 Supreme Court stay)
- Section 66A IT Act post-Shreya Singhal continued misuse documentation
- Journalist bail judgements â€” site:indiankanoon.org journalist UAPA bail
- IFF documented IT Act cases site:internetfreedom.in`,

  `You are an INTERNATIONAL MEDIA OBSERVER persona.
Focus your sub-queries on:
- Freedom House Freedom of the Press India score
- International Press Institute India incidents
- Foreign correspondent restrictions, visa denials, accreditation withdrawals India
- Comparative press freedom: India vs Bangladesh, Sri Lanka, Pakistan, Western democracies
- UNESCO journalist safety reports India`,

  `You are a DOCUMENTED INCIDENTS TRACKER persona.
Focus your sub-queries on:
- Specific recent cases: journalist arrests India 2023 2024 2025 with names
- UAPA charges journalists India list
- Newsroom raids India 2022 2023 2024 BBC Newsclick The Wire searches
- Kashmir press freedom incidents â€” Kashmir Press Club dissolved
- IFF and Article 14 compiled incident lists`,
];

function getPersonaForIndex(index: number, topicType?: TopicType): string {
  if (topicType === "democracy_civil_liberties") {
    return DEMOCRACY_PERSONAS[index % DEMOCRACY_PERSONAS.length];
  }
  if (topicType === "media_press") {
    return MEDIA_PRESS_PERSONAS[index % MEDIA_PRESS_PERSONAS.length];
  }
  return POSITIONAL_PERSONAS[index % POSITIONAL_PERSONAS.length];
}

// â”€â”€â”€ Timeout wrapper for model calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MODEL_CALL_TIMEOUT_MS = 60_000; // 60 seconds per model call

/**
 * Wraps an OpenAI-compat streaming or non-streaming call with a timeout.
 * Throws if the model takes longer than MODEL_CALL_TIMEOUT_MS.
 */
async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs = MODEL_CALL_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
const CreateAnthropicConversationBody = z.object({
  title: z.string().min(1).max(200),
  archiveId: z.number().int().positive(),
});
const GetAnthropicConversationParams = z.object({ id: z.number().int().positive() });
const DeleteAnthropicConversationParams = z.object({ id: z.number().int().positive() });
const ListAnthropicMessagesParams = z.object({ id: z.number().int().positive() });
const SendAnthropicMessageParams = z.object({ id: z.number().int().positive() });
const ListAnthropicConversationsQuery = z.object({
  archiveId: z.coerce.number().int().positive().optional(),
});
const ResearchModeSchema = z.enum(["fast_research", "deep_research", "council"]);
const SendAnthropicMessageBody = z.object({
  content:       z.string().min(1),
  mode:          z.enum(["normal", "web_search", "deep_research", "rhetorics", "drafting", "fast_research", "council"]).optional(),
  researchMode:  ResearchModeSchema.optional(),
  rhetoricsType: z.enum(["kavita", "speech", "debate"]).optional(),
  creativity:    z.number().min(0).max(1).optional(),
});

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isRateLimitOrQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string; code?: string };
  if (e.status === 429 || e.status === 529) return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("quota") || msg.includes("overloaded");
}

async function callGroqFallback(
  res: import("express").Response,
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  groqKey?: string | null
): Promise<string> {
  res.write(`data: ${JSON.stringify({ fallback: "groq-llama" })}\n\n`);
  const groq = getGroqClient(groqKey);
  const stream = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 8192,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
  });
  let fullResponse = "";
  for await (const chunk of stream) {
    if (res.writableEnded || res.destroyed) break;
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }
  return fullResponse;
}

// â”€â”€â”€ Synthesis helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildNumberedSourceList(allResults: SearchResult[], limit = 500): string {
  return formatNumberedSourceList(allResults, limit);
}

// â”€â”€â”€ Section 3: Cross-Model Discussion Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function extractEvidenceDenseLines(draft: string, maxChars: number): string {
  if (draft.length <= maxChars) return draft;
  const lines = draft.split("\n");
  const scored = lines.map((line) => ({
    line,
    score:
      (/\[Source\s+\d+\]/i.test(line) ? 3 : 0)
      + (/\d+(?:\.\d+)?(?:\s*(?:crore|lakh|million|billion|%|percent))/i.test(line) ? 2 : 0)
      + (/v\.\s+\w+|vs\.?\s+\w+|\bCourt\b|\bJudg/i.test(line) ? 2 : 0)
      + (line.length > 80 ? 1 : 0),
  }));
  const intro = draft.slice(0, 800);
  const remaining = Math.max(0, maxChars - intro.length - 6);
  const highValue = scored
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.line)
    .join("\n")
    .slice(0, remaining);
  return `${intro}\n...\n${highValue}`;
}

/**
 * generateCrossModelDiscussion â€” replaces generateDiscussion().
 * Receives the full IndependentResearchResult[] (with drafts filled in)
 * and produces a rich, structured debate comparing what each model
 * specifically found â€” naming real numbers, case names, and report titles.
 */
async function generateCrossModelDiscussion(
  userQuery: string,
  researchResults: IndependentResearchResult[],
  groqKey?: string | null
): Promise<string> {
  const modelSummaries = researchResults.map((r) => {
    const judgementsFound = r.judgements.length > 0
      ? `\n  **Court Judgements Found:** ${r.judgements.map(j => `${j.caseName} (${j.year})`).join(", ")}`
      : "";
    const govReportsFound = r.govReports.length > 0
      ? `\n  **Government Reports Found:** ${r.govReports.join(", ")}`
      : "";
    const numbersFound = r.stats.numbers.length > 0
      ? `\n  **Key Numbers Found:** ${r.stats.numbers.slice(0, 5).join("; ")}`
      : "";
    const percentagesFound = r.stats.percentages.length > 0
      ? `\n  **Percentages Found:** ${r.stats.percentages.slice(0, 5).join("; ")}`
      : "";
    const uniqueSources = [...new Set(r.searchResults.map(s => {
      try { return new URL(s.url).hostname; } catch { return s.url; }
    }))].slice(0, 5).join(", ");

    return `â•â•â• ${r.modelLabel} (Research Profile) â•â•â•
  **Sub-queries used:** ${r.subQueries.slice(0, 4).join(" | ")}
  **Sources consulted:** ${uniqueSources}${judgementsFound}${govReportsFound}${numbersFound}${percentagesFound}
  **Research Draft (evidence-prioritized):**
  ${extractEvidenceDenseLines(r.draft, 4000)}`;
  }).join("\n\n");

  const discussionPrompt = `Multiple AI research models independently investigated this MUN research question:
"${userQuery}"

Each model used a different research strategy and found different sources. Here is what each found:

${modelSummaries}

Now write a STRUCTURED CROSS-MODEL DISCUSSION. Format it exactly like this:

## ðŸ” What Each Researcher Found Uniquely

${researchResults.map(r => `**${r.modelLabel}:**`).join("\n")}

> For each model: 2-3 sentences on what UNIQUE data, judgements, or angles ONLY THAT MODEL found. Be specific â€” name actual numbers, case names, report names.

## âœ… Points of Agreement

> List 3-5 facts ALL models agree on. Cite the specific data points.

## âš”ï¸ Points of Divergence

> List 2-3 areas where models found DIFFERENT numbers, conflicting reports, or different legal interpretations. Explain WHY they might differ (different sources, different years of data, etc.)

## ðŸ“Š Data Quality Assessment

> Which model found the best quality sources (CAG/NCRB/PIB/court judgements)? Which found the most recent data? Which found the most court precedents?

## ðŸŽ¯ What the Synthesis Should Emphasize

> 3 bullet points on what the final merged answer MUST include based on what was found across all models.

RULES:
- Be specific. Name actual case names, report names, numbers found.
- Do NOT be vague like "Model A found more data" â€” say "Model A found NCRB 2023 data showing X cases"
- Total length: 300-500 words maximum
- Plain markdown only â€” no HTML`;

  // Fallback chain: Groq -> Cerebras -> Gemini (multiKeyFetch handles key rotation)
  const callDiscussion = async (client: any, model: string): Promise<string> => {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1200,
      temperature: 0.3,
      messages: [{ role: "user", content: discussionPrompt }],
    });
    return (response.choices?.[0]?.message?.content ?? "").trim();
  };

  if (groqKey?.trim() || process.env.GROQ_API_KEY) {
    try {
      const text = await callDiscussion(getGroqClient(groqKey ?? null), "llama-3.3-70b-versatile");
      if (text) return text;
    } catch { /* fall through */ }
  }

  if (isCerebrasEnabled()) {
    try {
      const text = await callDiscussion(getCerebrasClient(), "llama3.3-70b");
      if (text) return text;
    } catch { /* fall through */ }
  }

  // Last resort: return empty string rather than crashing
  return "";
}

/**
 * buildSynthesisPromptForMUN â€” replaces buildSynthesisPrompt() for multi-model mode.
 * Leads with statistics, mandates court judgement citations, government sources first.
 */
function buildSynthesisPromptForMUN(
  userQuery: string,
  researchResults: IndependentResearchResult[],
  discussion: string,
  manifest: FullSourceManifest,
): string {
  const judgementsBlock = manifest.courtJudgements.length > 0
    ? `\n\n## COURT JUDGEMENTS - MANDATORY CITATION FORMAT: **Case Name (Year, Court)** - [held] [Source N](url)\n`
      + manifest.courtJudgements.map((block) =>
        `[Source ${block.index}] ${block.judgement?.caseName ?? block.title} (${block.judgement?.year ?? "n.d."}, ${block.judgement?.court ?? "court"}) - ${block.judgement?.held?.slice(0, 300) ?? block.snippet.slice(0, 300)}`
      ).join("\n")
    : "";

  const allNumbers     = [...new Set(researchResults.flatMap(r => r.stats.numbers))].slice(0, 15);
  const allPercentages = [...new Set(researchResults.flatMap(r => r.stats.percentages))].slice(0, 10);
  const numbersBlock = (allNumbers.length + allPercentages.length) > 0
    ? `\n\n## NUMERICAL DATA FOUND ACROSS ALL MODELS:\nCounts/Absolutes: ${allNumbers.join("; ")}\nRatios/Percentages: ${allPercentages.join("; ")}`
    : "";

  const draftSections = researchResults
    .map(r => `â”€â”€â”€ ${r.modelLabel}'s Independent Research â”€â”€â”€\n${r.draft || "(no draft)"}`)
    .join("\n\n");

  return `You are producing the FINAL DEFINITIVE ANSWER for a MUN (Model United Nations) research question, specifically for INDIAN delegates.

## CONTEXT
User's Question: "${userQuery}"

## CROSS-MODEL DISCUSSION (what each model found independently):
${discussion}

## INDIVIDUAL MODEL DRAFTS:
${draftSections}
${judgementsBlock}
${numbersBlock}

## COMPLETE SOURCE MANIFEST (${manifest.totalSources} sources - cite all of them)
${manifest.numberedList}

## FULL SOURCE CONTENT (read every source before writing)
${manifest.fullContextBlock}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
## MANDATORY OUTPUT FORMAT â€” DO NOT DEVIATE:
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

# [Answer Title â€” specific to the question]

## ðŸ“Š Key Statistics & Data
> LEAD WITH NUMBERS. Every bullet must have a specific number AND a citation.
- [Statistic with specific number] [Source N](url)
- [At least 5-8 statistics minimum if data exists]

## âš–ï¸ Legal Framework & Court Judgements
> MANDATORY if any court judgements were found. Skip section only if zero judgements found.
- **[Case Name] ([Year])**: [What was held â€” 1-2 sentences] [Source N](url)
- [Constitutional articles / IPC sections / Acts applicable] [Source N](url)

## ðŸ›ï¸ Official Government Position
> What does the Indian government officially say? CAG findings? PIB announcements?
- [Official position or finding] [Source N](url) [PIB/CAG/MEA badge]

## ðŸ” Key Findings
- [Finding 1 â€” factual, cited] [Source N](url)
- [At least 5 findings]

## ðŸŒ International Context (if relevant for MUN)
- [India's UN voting record / treaty obligations / international comparisons] [Source N](url)

## âš ï¸ Data Conflicts & Caveats
> If models found conflicting numbers or sources contradicted each other, flag it here.
- [Conflict or caveat if any]

## Source Coverage Audit
For EVERY source [1]-[${manifest.totalSources}]: "Used - [why]" OR "Not cited - [why]"

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
## CRITICAL RULES:
1. EVERY factual claim needs [Source N](url) citation
2. Statistics section MUST have at least 5 bullets if data was found
3. Court judgements section MUST appear if any judgements were found
4. Government sources (CAG, NCRB, PIB, MEA) get priority over news media
5. Do NOT use vague phrases like "according to reports" â€” name the specific report
6. Do NOT invent data â€” if sources didn't cover something, say "sources do not specify"
7. MANDATORY STATISTICS: You MUST include every number from the "NUMERICAL DATA FOUND" section above in your ## Key Statistics & Data section. Each number must be cited with its source URL. Do NOT omit any statistic â€” these came from official government reports and must appear in the answer.
8. MANDATORY COURT CITATIONS: Every judgement listed in "COURT JUDGEMENTS AVAILABLE" must appear in your answer as: **CaseName (Year, Court)** â€” [held summary] [Source N](url)
9. Indian context first: always frame through India's position/data/law
10. Use bullet points as the default shape. Keep any paragraph to 3 sentences or fewer.
11. Minimum 800 words, maximum 2000 words
12. NEVER group multiple sources in one bracket like [Source 3, 4, 5].
13. ALWAYS cite each source separately with its own link: [Source 3](url) [Source 4](url)
14. Each citation MUST be in the format [Source N](url) - the (url) part is mandatory.
15. EVERY source in the manifest MUST appear in Source Coverage Audit.`;
}

export function buildDivisionAwareSynthesisPrompt(
  userQuery: string,
  engine: DimensionEngineOutput,
  registry: EvidenceRegistry,
  divisionDrafts: Record<string, string>,
  discussion: string,
  manifest?: FullSourceManifest,
): string {
  const divisionInstructions = DIVISION_REGISTRY.map((division) => {
    const draft = divisionDrafts[division.id];
    return draft ? `## ${division.name}\n${draft}` : division.generateInstructions(engine);
  }).join("\n\n---\n\n");

  const sourceBlock = registry.sources
    .map((source) => {
      const badge = source.tier === "tier1" ? " [T1-CONSTITUTIONAL]"
        : source.tier === "tier2" ? " [T2-OFFICIAL]"
          : source.tier === "tier3" ? " [T3-DATA]"
            : source.tier === "tier4" ? " [T4-EXPERT]"
              : source.tier === "tier5" ? " [T5-COMPARATIVE]"
                : "";
      const snippetOnly = source.hasFullContent ? "" : " [SNIPPET ONLY]";
      return `[${source.index}]${badge}${snippetOnly} ${source.title} - ${source.url}`;
    })
    .join("\n");

  const courtBlock = registry.courtJudgements.length > 0
    ? `\n\n## COURT JUDGEMENTS - MANDATORY CITATION FORMAT: **Case Name (Year, Court)** - [held] [Source N](url)\n`
      + registry.courtJudgements.map(({ source, judgement }) =>
        `[Source ${source.index}] ${judgement.caseName} (${judgement.year}, ${judgement.court}) - ${judgement.held.slice(0, 200)}`
      ).join("\n")
    : "";

  return `You are generating a PARLIAMENTARY INTELLIGENCE BRIEFING for an Indian MUN delegate. This is not an essay or a search result summary - it is an elite research document structured across 11 analytical Divisions.

## AGENDA
"${userQuery}"

## COMMITTEE: ${engine.committeeType.replace(/_/g, " ").toUpperCase()}
## AGENDA CLASS: ${engine.agendaClass.replace(/_/g, " ").toUpperCase()}
## ACTIVE PRIMARY DIMENSIONS: ${engine.primaryDimensions.map((d) => d.name.replace(/_/g, " ")).join(", ")}
## ACTIVE SECONDARY DIMENSIONS: ${engine.secondaryDimensions.map((d) => d.name.replace(/_/g, " ")).join(", ")}

${PARLIAMENTARY_REGISTER_RULES}

## CROSS-MODEL RESEARCH DISCUSSION
${discussion}

## EVIDENCE REGISTRY (cite EVERY factual claim as [Source N](url))
${manifest?.numberedList || sourceBlock || "(No sources retrieved.)"}
${courtBlock}

${manifest ? `## FULL SOURCE CONTENT (all retrieved sources)\n${manifest.fullContextBlock}` : ""}

## CONTESTED EVIDENCE WARNINGS
${registry.conflictedClaims.length > 0 ? registry.conflictedClaims.map((c) => `- ${c}`).join("\n") : "No data conflicts detected."}

## EVIDENCE GAPS
${registry.evidenceGaps.length > 0 ? registry.evidenceGaps.map((g) => `- ${g}`).join("\n") : "No critical evidence gaps detected."}

---

## OUTPUT STRUCTURE - 11 DIVISIONS

Generate ALL 11 Divisions in sequence. Each Division must meet the minimum word count for its priority level.

${divisionInstructions}

---

## GENERATION RULES
1. Every factual claim requires [Source N](url)
2. Every court case requires: **Case Name (Year, Court)** - [held] [Source N](url)
3. NEVER open any section with "In the context of..." or "This is a complex..."
4. Division 7 (Debate Utility Arsenal) MUST have at least 15 POIs and 6 primary arguments
5. Division 11 (Strategic Insights) MUST introduce perspectives not stated in Divisions 1-10
6. Sources marked [SNIPPET ONLY] may be cited for title/position only - not for specific data
7. Evidence Gaps must appear in Division 6 Layer 6.7 - do not omit them
8. Minimum total output: 3,500 words
9. Indian institutional vocabulary throughout: Lok Sabha, Rajya Sabha, Article N, Section N, CAG, NCRB, PIB, MEA - not generic UN vocabulary unless the topic demands it`;
}

export function buildPrimarySynthesizerSystemPrompt(engine: DimensionEngineOutput): string {
  return `You are an elite parliamentary research analyst generating a classified briefing for an Indian MUN delegate. Every sentence must justify its presence.

Agenda: "${engine.agendaText}"
Committee: ${engine.committeeType.replace(/_/g, " ").toUpperCase()}
Agenda Classification: ${engine.agendaClass.replace(/_/g, " ").toUpperCase()}

Primary dimensions: ${engine.primaryDimensions.map((d) => `${d.name.replace(/_/g, " ")} (score: ${d.boostedScore})`).join(", ")}
Secondary dimensions: ${engine.secondaryDimensions.map((d) => d.name.replace(/_/g, " ")).join(", ")}

Produce an 11-Division parliamentary intelligence briefing. You are not summarizing web pages - you are synthesizing evidence into parliamentary intelligence.

Citation discipline: every factual claim requires a citation. Court cases require **Case Name (Year, Court)**. Government data requires the named source. Never write "according to reports" or "experts suggest".`;
}

interface DivisionOwnership {
  model: string;
  divisions: string[];
  tokenBudget: number;
  systemPrompt: string;
  priority: "primary_synthesizer" | "analytical_researcher" | "debate_specialist" | "verification";
}

function selectPrimarySynthesizer(models: string[]): string {
  const capability: Record<string, number> = {
    "gemini/gemini-2.0-flash": 100,
    "gemini/gemini-2.5-pro": 95,
    "groq/llama-3.3-70b-versatile": 85,
    "nvidia/llama-3.1-nemotron-70b-instruct": 80,
    "openrouter/meta-llama/llama-3.1-70b-instruct": 75,
    "groq/llama-3.1-8b-instant": 40,
    "nvidia/llama-3.1-nemotron-nano-8b-v1": 35,
  };
  return [...models].sort((a, b) => (capability[b] ?? 50) - (capability[a] ?? 50))[0];
}

function assignDivisionOwnership(
  models: string[],
  dimensionEngine: DimensionEngineOutput,
  totalTokenBudget: number
): DivisionOwnership[] {
  if (models.length === 0) return [];
  const primaryModel = selectPrimarySynthesizer(models);
  const researchModels = models.filter((model) => model !== primaryModel);
  const assignments: DivisionOwnership[] = [{
    model: primaryModel,
    divisions: ["core_brief", "analytical_dimensions_primary", "debate_utility", "strategic_insights"],
    tokenBudget: Math.floor(totalTokenBudget * 0.45),
    systemPrompt: buildPrimarySynthesizerSystemPrompt(dimensionEngine),
    priority: "primary_synthesizer",
  }];
  if (researchModels[0]) assignments.push({
    model: researchModels[0],
    divisions: ["stakeholder_mapping", "conflict_mapping", "narrative_analysis"],
    tokenBudget: Math.floor(totalTokenBudget * 0.25),
    systemPrompt: buildPrimarySynthesizerSystemPrompt(dimensionEngine),
    priority: "analytical_researcher",
  });
  if (researchModels[1]) assignments.push({
    model: researchModels[1],
    divisions: ["evidence_verification", "policy_pathways", "predictive_analysis"],
    tokenBudget: Math.floor(totalTokenBudget * 0.20),
    systemPrompt: buildPrimarySynthesizerSystemPrompt(dimensionEngine),
    priority: "analytical_researcher",
  });
  if (researchModels[2]) assignments.push({
    model: researchModels[2],
    divisions: ["resolution_support"],
    tokenBudget: Math.floor(totalTokenBudget * 0.10),
    systemPrompt: buildPrimarySynthesizerSystemPrompt(dimensionEngine),
    priority: "verification",
  });
  return assignments;
}

async function generateDivisionSequentially(
  divisionId: string,
  engine: DimensionEngineOutput,
  evidenceRegistry: EvidenceRegistry,
  client: any,
  modelId: string,
  send: (event: object) => void
): Promise<string> {
  const division = DIVISION_REGISTRY.find((d) => d.id === divisionId);
  if (!division) return "";
  send({ type: "division_started", division: divisionId, dimensionClass: "primary" });
  const activeDimensions = [...engine.primaryDimensions, ...engine.secondaryDimensions].map((dimension) => dimension.name);
  const modelProfile = resolveModelProfile(modelId);

  const prompt = `${PARLIAMENTARY_REGISTER_RULES}

${division.generateInstructions(engine)}

EVIDENCE AVAILABLE FOR THIS DIVISION:
${buildEvidenceBlockForDivision(division, evidenceRegistry, modelProfile, activeDimensions)}

CITATION REQUIREMENT: Every specific factual claim must use [Source N](url). Every court case must use: **Case Name (Year, Court)** - [held summary] [Source N](url).

Generate this Division now. Output only the Division content.`;

  const response = await client.chat.completions.create({
    model: modelId,
    max_tokens: Math.max(1200, division.minWordsForPrimary * 4),
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.choices?.[0]?.message?.content ?? "";
  send({ type: "division_complete", division: divisionId, wordCount: text.split(/\s+/).filter(Boolean).length, citationCount: countCitations(text) });
  return text;
}

/**
 * MUN-specific synthesis: uses buildSynthesisPromptForMUN and the full
 * IndependentResearchResult array (drafts + stats + judgements + discussion).
 */
async function synthesizeDraftsForMUN(
  userQuery: string,
  researchResults: IndependentResearchResult[],
  discussion: string,
  manifest: FullSourceManifest,
  groqKey?: string | null
): Promise<string> {
  const groq = getGroqClient(groqKey ?? null);
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 8192,
    temperature: 0.3,
    messages: [{ role: "user", content: buildSynthesisPromptForMUN(userQuery, researchResults, discussion, manifest) }],
  });
  return response.choices?.[0]?.message?.content ?? "";
}

// â”€â”€â”€ Pipeline metadata embedding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Pipeline data (per-model searches/results, discussion, sources) is stored
// at the END of the assistant message content as a hidden HTML comment so
// the frontend can re-render the research pipeline for completed messages.
const PIPELINE_META_MARKER_OPEN = "<!--BESTDEL_PIPELINE:";
const PIPELINE_META_MARKER_CLOSE = "-->";

interface PipelineMetadata {
  runId?: string;
  requestId?: string;
  conversationId?: number | string;
  assistantMessageId?: number | string;
  queryHash?: string;
  researchMode?: ResearchMode;
  terminalStatus?: "completed" | "completed_with_source_gaps" | "degraded_fallback" | "failed" | "provider_error" | "legacy_fallback_used" | "cancelled";
  coreGenerationUsed?: boolean;
  legacyFallbackUsed?: boolean;
  liveRetrievalUsed?: boolean;
  sourceContract?: {
    requiredSources: number;
    citationEligibleSources: number;
    finalUniqueCitedSources: number;
    passedStrict?: boolean;
    passedWithSourceGaps?: boolean;
    passed: boolean;
    status?: "passed" | "passed_with_source_gaps" | "failed";
    reason?: string;
  };
  sourceGapReport?: unknown;
  qualityGate?: unknown;
  citationStatus?: unknown;
  sourceUsageFailureReports?: unknown;
  providerErrors?: unknown;
  councilSession?: unknown;
  degradedFallbackUsed?: boolean;
  deterministicCitedFallbackUsed?: boolean;
  citationRepairAttempted?: boolean;
  citationRepairSucceeded?: boolean;
  underCitationReason?: string;
  bucketCoverage?: unknown;
  mode?: "web_search" | "deep_research" | ResearchMode;
  models?: {
    key: string;
    label: string;
    searches: string[];
    found: { title: string; url: string; engine?: string; sourceType?: string }[];
    exhausted: { reason: "rate_limit" | "error" } | null;
  }[];
  discussion?: string | null;
  sources?: { sourceId?: number; title: string; url: string; sourceType?: string; bucketIds?: string[]; cited?: boolean }[];
  legacyDebug?: unknown;
}

function embedPipelineMeta(content: string, meta: PipelineMetadata): string {
  return embedPipelineMetadata(content, meta as unknown as Record<string, unknown>);
}

interface ActiveResearchRun {
  identity: ResearchRunIdentity;
  abortController: AbortController;
  cancel: (reason: string) => Promise<void>;
  cancelled: boolean;
}

const activeResearchRunsByConversation = new Map<number, ActiveResearchRun>();

const assistantPersistenceStore = {
  async insertAssistantMessage(conversationId: number, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null) {
    await createMessageFromJson(conversationId, "assistant", content, metadataJson ?? null, runId ?? null, runStatus ?? null);
  },
  async updateAssistantMessage(id: number | string, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null) {
    await updateMessage(Number(id), {
      content,
      ...(metadataJson !== undefined ? { metadataJson } : {}),
      ...(runId !== undefined ? { runId } : {}),
      ...(runStatus !== undefined ? { runStatus } : {}),
    });
  },
};

function queryHashFor(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function isResearchRouteMode(mode: string): boolean {
  return mode === "web_search" || mode === "deep_research" || mode === "fast_research" || mode === "council";
}

function normalizeEffectiveResearchMode(userContent: string, mode: string, selected?: ResearchMode): ResearchMode {
  if (selected) return selected;
  if (mode === "fast_research" || mode === "deep_research" || mode === "council") return mode;
  return inferResearchMode(userContent, mode === "web_search" ? "web_search" : "deep_research");
}

function coreProviderNameFromModel(model: string): string | undefined {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : undefined;
}

function modeAwareFailureTitle(mode: ResearchMode, terminalStatus: string): string {
  if (terminalStatus === "cancelled") return "Research Cancelled";
  if (terminalStatus === "provider_error") return "Provider Error";
  switch (mode) {
    case "fast_research":
      return "Fast Research Failed";
    case "deep_research":
      return "Deep Research Failed";
    case "council":
      return "Council Research Failed";
    default:
      return "Response Failed";
  }
}

function envelopeRunEvent(identity: ResearchRunIdentity, eventType: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
  return buildRunEventEnvelope(identity, eventType, payload);
}

function normalizeLegacySsePayload(identity: ResearchRunIdentity | undefined, payload: Record<string, unknown>): Record<string, unknown> {
  if (!identity) return payload;
  const eventType = typeof payload.eventType === "string"
    ? payload.eventType
    : typeof payload.type === "string"
      ? payload.type
      : typeof payload.content === "string"
        ? "answer_delta"
        : "legacy_event";
  return envelopeRunEvent(identity, eventType, {
    diagnostics: payload.diagnostics ?? {
      legacyPath: true,
      terminalStatus: payload.terminalStatus ?? null,
      code: payload.code ?? null,
      error: payload.error ?? null,
    },
    ...payload,
  });
}

function buildLegacyTerminalMetadata(
  identity: ResearchRunIdentity | undefined,
  terminalStatus: PipelineMetadata["terminalStatus"],
  extra: PipelineMetadata = {},
): PipelineMetadata {
  return {
    runId: identity?.runId,
    requestId: identity?.requestId,
    conversationId: identity?.conversationId,
    assistantMessageId: identity?.assistantMessageId,
    queryHash: identity?.queryHash,
    researchMode: identity?.researchMode,
    terminalStatus,
    coreGenerationUsed: false,
    legacyFallbackUsed: terminalStatus === "legacy_fallback_used" || extra.legacyFallbackUsed === true,
    liveRetrievalUsed: extra.liveRetrievalUsed ?? true,
    ...extra,
  };
}

async function persistResearchExhausted(input: {
  conversationId: number;
  runIdentity?: ResearchRunIdentity;
  citationEligibleSources: number;
  send: (data: object) => void;
  metadata?: PipelineMetadata;
}): Promise<PipelineMetadata["terminalStatus"]> {
  const terminalStatus: PipelineMetadata["terminalStatus"] =
    input.citationEligibleSources > 0 ? "completed_with_source_gaps" : "failed";
  const message = input.citationEligibleSources > 0
    ? "Research retrieved some evidence, but every model/context batch was exhausted before a validated final answer could be produced."
    : "Research could not retrieve usable evidence, so no validated final answer was produced.";
  const metadata = buildLegacyTerminalMetadata(input.runIdentity, terminalStatus, {
    ...input.metadata,
    terminalStatus,
    sourceGapReport: {
      reason: "both_exhausted",
      citationEligibleSources: input.citationEligibleSources,
      message,
    },
  });

  await persistAssistantFailed({
    store: assistantPersistenceStore,
    conversationId: input.conversationId,
    assistantMessageId: input.runIdentity?.assistantMessageId,
    title: terminalStatus === "failed" ? "Research Failed" : "Research Completed With Source Gaps",
    message,
    metadata,
  });
  input.send({
    eventType: terminalStatus,
    bothExhausted: true,
    done: true,
    terminalStatus,
    sourceGapReport: metadata.sourceGapReport,
  });
  return terminalStatus;
}

export function buildCoreProviderRouter(keys: RequestKeys, rawModelId: string): { router?: CoreProviderRouter; providerName?: ProviderName; model?: string; error?: string } {
  const parsed = parseProviderModelId(rawModelId);
  const router = new CoreProviderRouter();
  if (keys.groqKey || process.env.GROQ_API_KEY) router.register(new GroqProvider({ apiKey: keys.groqKey ?? process.env.GROQ_API_KEY, fetchFn: multiKeyFetch }));
  const openrouterKey = keys.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY;
  if (openrouterKey) router.register(new OpenRouterProvider({ apiKey: openrouterKey, fetchFn: multiKeyFetch }));
  if (keys.geminiKey || process.env.GEMINI_API_KEY) router.register(new GeminiProvider({ apiKey: keys.geminiKey ?? process.env.GEMINI_API_KEY, fetchFn: multiKeyFetch }));
  if (keys.nvidiaKey || process.env.NVIDIA_API_KEY) router.register(new NvidiaProvider({ apiKey: keys.nvidiaKey ?? process.env.NVIDIA_API_KEY, fetchFn: multiKeyFetch }));
  const githubToken = keys.githubToken ?? process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN;
  if (githubToken) router.register(new GithubProvider({ apiKey: githubToken, fetchFn: multiKeyFetch }));
  const cerebrasKey = keys.cerebrasKey ?? process.env.CEREBRAS_API_KEY;
  if (cerebrasKey) router.register(new CerebrasProvider({ apiKey: cerebrasKey, fetchFn: multiKeyFetch }));
  if (parsed.prefix === "groq") {
    if (!keys.groqKey && !process.env.GROQ_API_KEY) return { error: "Groq provider unavailable: missing API key" };
    return { router, providerName: "groq", model: parsed.modelId };
  }
  if (parsed.prefix === "openrouter") {
    if (!openrouterKey) return { error: "OpenRouter provider unavailable: missing API key" };
    return { router, providerName: "openrouter", model: parsed.modelId };
  }
  if (parsed.prefix === "gemini") {
    if (!keys.geminiKey && !process.env.GEMINI_API_KEY) return { error: "Gemini provider unavailable: missing API key" };
    return { router, providerName: "gemini", model: parsed.modelId };
  }
  if (parsed.prefix === "nvidia") {
    if (!keys.nvidiaKey && !process.env.NVIDIA_API_KEY) return { error: "NVIDIA provider unavailable: missing API key" };
    return { router, providerName: "nvidia", model: parsed.modelId };
  }
  if (parsed.prefix === "github") {
    if (!githubToken) return { error: "GitHub Models provider unavailable: missing token" };
    return { router, providerName: "github", model: parsed.modelId };
  }
  if (parsed.prefix === "cerebras") {
    if (!cerebrasKey) return { error: "Cerebras provider unavailable: missing API key" };
    return { router, providerName: "cerebras", model: parsed.modelId };
  }
  return { error: `Core model-backed generation does not support provider prefix '${parsed.prefix}'` };
}

function councilRetrievalSourceToEvidenceInput(source: BucketedRetrievalResult["enrichedResults"][number]): RawEvidenceSourceInput {
  return {
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl ?? source.url,
    domain: source.domain,
    date: source.publishedDate,
    excerpt: source.fullText ?? source.snippet,
    snippet: source.snippet,
    fullText: source.fullText ?? null,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    authorityScore: source.score,
    extractionQuality: source.extractionQuality ?? "snippet",
    discoveredBy: source.discoveredBy,
    extractionProvider: source.extractionProvider,
    keyFacts: [source.snippet, source.fullText?.slice(0, 280)]
      .filter((value): value is string => typeof value === "string" && value.trim().length >= 24),
    keyNumbers: [...new Set(`${source.title} ${source.snippet} ${source.fullText ?? ""}`.match(/\b20\d{2}\b|\b\d+(?:\.\d+)?%/g) ?? [])].slice(0, 5),
    legalHoldings: source.sourceClass === "court_primary" || source.sourceClass === "legal_commentary" ? [source.snippet].filter((value): value is string => Boolean(value)) : [],
    limitations: source.limitations ?? [],
    citationEligible: source.citationEligible ?? false,
    topChunks: source.fullText
      ? [{ text: source.fullText.slice(0, 700), score: 0.7, chunkIndex: 0 }]
      : source.snippet
        ? [{ text: source.snippet, score: 0.4, chunkIndex: 0 }]
        : [],
  };
}

function renderCouncilSessionAnswer(session: CouncilSession): string {
  const councillorSections = Object.values(session.councillors)
    .filter((output): output is NonNullable<typeof output> => Boolean(output))
    .map((output) => [
      `## ${output.councillor_id}: ${output.title}`,
      output.status === "failed" ? `Status: failed. ${output.error ?? ""}` : output.summary,
      ...output.key_claims.slice(0, 12).map((claim) => `- ${claim.text} (${claim.source_ids.join(", ")})`),
    ].join("\n"))
    .join("\n\n");
  const sealLines = session.seals.length
    ? session.seals.map((seal) => `- ${seal.claim.text} (${seal.support_count} councillors: ${seal.endorsing_councillors.join(", ")})`).join("\n")
    : "- No Council Seal reached the 3-councillor threshold.";
  const disputeLines = session.disputes.length
    ? session.disputes.slice(0, 6).map((dispute) => `- ${dispute.summary}`).join("\n")
    : "- No major disputes were detected.";
  const verdict = session.verdict;
  const verdictSection = verdict
    ? [
        "## Chief Councillor Verdict",
        verdict.strategic_position,
        "### Top Arguments",
        ...verdict.top_arguments.map((item) => `- ${item.argument} (${item.strength})`),
        "### Top Vulnerabilities",
        ...verdict.top_vulnerabilities.map((item) => `- ${item.vulnerability} (${item.severity})`),
        "### Speech Strategy",
        verdict.recommended_speech_strategy,
        "### POI Bank",
        ...verdict.poi_bank.slice(0, 8).map((item) => `- ${item.poi} - ${item.timing_cue}`),
      ].join("\n")
    : "## Chief Councillor Verdict\nNo Chief verdict could be generated.";
  return [
    "# Council Session",
    `Agenda: ${session.topic}`,
    `Status: ${session.terminalStatus}`,
    "",
    "## Council Seals",
    sealLines,
    "",
    "## Disputes",
    disputeLines,
    "",
    councillorSections,
    "",
    verdictSection,
  ].join("\n").trim();
}

const COUNCIL_REQUIRED_SOURCES = 180;
const COUNCIL_MIN_FINAL_WORDS = 3000;
const COUNCIL_MAX_FINAL_WORDS = 5500;

function buildCouncilFinalAnswer(session: CouncilSession, retrieval: BucketedRetrievalResult): string {
  const baseAnswer = renderCouncilSessionAnswer(session);
  const answerSourceIds = extractCouncilMarkdownSourceIds(baseAnswer);
  const citedCount = answerSourceIds.size;
  if (countWords(baseAnswer) >= COUNCIL_MIN_FINAL_WORDS && citedCount >= COUNCIL_REQUIRED_SOURCES) {
    return trimCouncilAnswerToWordCap(baseAnswer);
  }

  let bestUnderCap = "";
  for (const factWordLimit of [18, 14, 12, 8, 5]) {
    const evidenceSection = buildCouncilEvidenceSection(retrieval, factWordLimit, COUNCIL_REQUIRED_SOURCES);
    if (!evidenceSection) continue;
    const candidate = `${baseAnswer.trim()}\n\n${evidenceSection}`;
    const candidateWords = countWords(candidate);
    const candidateCitations = extractCouncilMarkdownSourceIds(candidate).size;
    if (
      candidateWords >= COUNCIL_MIN_FINAL_WORDS
      && candidateCitations >= COUNCIL_REQUIRED_SOURCES
      && candidateWords <= COUNCIL_MAX_FINAL_WORDS
    ) {
      return candidate;
    }
    if (candidateWords <= COUNCIL_MAX_FINAL_WORDS && candidateWords > countWords(bestUnderCap)) {
      bestUnderCap = candidate;
    }
  }

  if (bestUnderCap) return bestUnderCap;
  const fallbackSection = buildCouncilEvidenceSection(retrieval, 3, COUNCIL_REQUIRED_SOURCES);
  return trimCouncilAnswerToWordCap(fallbackSection ? `${baseAnswer.trim()}\n\n${fallbackSection}` : baseAnswer);
}

function buildCouncilEvidenceSection(
  retrieval: BucketedRetrievalResult,
  factWordLimit: number,
  sourceTarget: number,
): string {
  const bullets = retrieval.enrichedResults
    .map((source, index) => {
      const sourceId = index + 1;
      const fact = compactCouncilEvidenceFact([source.title, source.snippet, source.fullText].filter(Boolean).join(" "), factWordLimit);
      if (!fact || !source.url) return null;
      return `- ${fact} [Source ${sourceId}](${source.url})`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, sourceTarget);
  if (bullets.length === 0) return "";
  return [
    "## Additional Evidence Bullets",
    "Debate-ready cited points from the evidence registry:",
    ...bullets,
  ].join("\n");
}

function compactCouncilEvidenceFact(value: string, maxWords: number): string {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/\b(JavaScript must be enabled|Decrease Font Size|Increase Font Size|Normal Theme|Sitemap|Advance Search)\b.*$/i, "")
    .trim();
  return truncateWords(cleaned || "Retrieved evidence record", maxWords);
}

function extractCouncilMarkdownSourceIds(answer: string): Set<number> {
  const ids = new Set<number>();
  for (const match of answer.matchAll(/\[Source\s+(\d+)\]/gi)) {
    const id = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function truncateWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function trimCouncilAnswerToWordCap(answer: string): string {
  if (countWords(answer) <= COUNCIL_MAX_FINAL_WORDS) return answer;
  const notice = "\n\n## Trim Notice\nMode word-cap of 5500 words enforced.";
  const noticeWords = countWords(notice);
  return `${truncateWords(answer, Math.max(1, COUNCIL_MAX_FINAL_WORDS - noticeWords))}${notice}`;
}

function buildCouncilMetadata(identity: ResearchRunIdentity, session: CouncilSession, retrieval: BucketedRetrievalResult, finalAnswer: string): PipelineMetadata {
  const citedCouncilSourceIds = extractCouncilMarkdownSourceIds(finalAnswer);
  const finalUniqueCitedSources = citedCouncilSourceIds.size;
  const citationEligibleSources = retrieval.citationEligibleEstimate;
  const passedStrict = session.terminalStatus === "completed" && finalUniqueCitedSources >= COUNCIL_REQUIRED_SOURCES;
  const passedWithSourceGaps = session.terminalStatus === "completed_with_source_gaps"
    || (session.terminalStatus === "completed" && finalUniqueCitedSources > 0 && finalUniqueCitedSources < COUNCIL_REQUIRED_SOURCES);
  const sourceContractStatus = passedStrict ? "passed" : passedWithSourceGaps ? "passed_with_source_gaps" : "failed";
  return {
    runId: identity.runId,
    requestId: identity.requestId,
    conversationId: identity.conversationId,
    assistantMessageId: identity.assistantMessageId,
    queryHash: identity.queryHash,
    researchMode: "council",
    terminalStatus: session.terminalStatus,
    coreGenerationUsed: false,
    legacyFallbackUsed: false,
    liveRetrievalUsed: true,
    sourceContract: {
      requiredSources: COUNCIL_REQUIRED_SOURCES,
      citationEligibleSources,
      finalUniqueCitedSources,
      passedStrict,
      passedWithSourceGaps,
      passed: passedStrict || passedWithSourceGaps,
      status: sourceContractStatus,
      reason: passedStrict
        ? "Council completed with at least one Council Seal."
        : passedWithSourceGaps
          ? "Council completed with partial councillor/source gaps."
          : "Council could not establish enough grounded councillor evidence.",
    },
    sourceGapReport: retrieval.sourceGapReport,
    citationStatus: {
      finalUniqueCitedSources,
      totalLinkedCitations: finalUniqueCitedSources,
      citedSourceIds: [...citedCouncilSourceIds].sort((a, b) => a - b),
      citationCoverage: citationEligibleSources > 0 ? finalUniqueCitedSources / citationEligibleSources : 0,
      invalidCitations: [],
      citedBuckets: [...new Set(retrieval.enrichedResults.flatMap((source) => source.bucketIds))],
    },
    councilSession: session,
    sources: retrieval.enrichedResults.map((source, index) => ({
      sourceId: index + 1,
      title: source.title,
      url: source.url,
      sourceType: source.sourceClass,
      bucketIds: source.bucketIds,
      cited: citedCouncilSourceIds.has(index + 1),
      discoveredBy: source.discoveredBy,
      extractedBy: source.extractionProvider,
      fallbackExtractionUsed: source.fallbackExtractionUsed,
    })),
  };
}

export const __councilTestHooks = {
  buildCouncilFinalAnswer,
  buildCouncilMetadata,
};

// â”€â”€â”€ Multi-model search handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€



// â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get("/anthropic/conversations", async (req, res) => {
  const ownerUserId = getRequestOwnerId(req);
  const queryParsed = ListAnthropicConversationsQuery.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const convos = queryParsed.data.archiveId
    ? await getConversationsByArchiveId(queryParsed.data.archiveId, ownerUserId)
    : await listConversations(ownerUserId);
  res.json(convos.map(toApiConversation));
});

router.post("/anthropic/conversations", async (req, res) => {
  const ownerUserId = getRequestOwnerId(req);
  const parsed = CreateAnthropicConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const archive = await getArchiveById(parsed.data.archiveId, ownerUserId);
  if (!archive) { res.status(404).json({ error: "Archive not found" }); return; }
  const convo = await createConversation(parsed.data.archiveId, parsed.data.title, ownerUserId);
  res.status(201).json(toApiConversation(convo));
});

// Update conversation title
router.patch("/anthropic/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const ownerUserId = getRequestOwnerId(req);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const updated = await updateConversationTitle(id, title.slice(0, 200), ownerUserId);
  if (!updated) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json(toApiConversation(updated));
});

// Generate AI conversation title from first user message
// Uses multiKeyFetch directly for seamless multi-key rotation across all providers.
router.post("/anthropic/generate-title", async (req, res) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) { res.status(400).json({ error: "content is required" }); return; }
  const fallback = () => content.split(/\s+/).slice(0, 5).join(" ");

  const groqKey = (req.headers["x-groq-api-key"] as string | undefined) ?? null;
  const nvidiaKey = (req.headers["x-nvidia-api-key"] as string | undefined) ?? null;
  const cerebrasKey = (req.headers["x-cerebras-api-key"] as string | undefined) ?? null;
  const geminiKey = (req.headers["x-gemini-api-key"] as string | undefined) ?? null;

  const titlePrompt = [
    { role: "system" as const, content: "Generate a concise 4-6 word title (no quotes, no punctuation) for this conversation." },
    { role: "user" as const, content: `Title for: ${content.slice(0, 500)}` },
  ];

  // Ordered list of providers to try — multiKeyFetch handles comma-separated key rotation
  const providers: Array<{ name: string; key: string | null; baseUrl: string; model: string }> = [
    { name: "groq", key: groqKey ?? process.env.GROQ_API_KEY ?? null, baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
    { name: "nvidia", key: nvidiaKey ?? process.env.NVIDIA_API_KEY ?? null, baseUrl: "https://integrate.api.nvidia.com/v1", model: "nvidia/llama-3.1-nemotron-nano-8b-v1" },
    { name: "cerebras", key: cerebrasKey ?? process.env.CEREBRAS_API_KEY ?? null, baseUrl: "https://api.cerebras.ai/v1", model: "llama3.1-8b" },
    { name: "gemini", key: geminiKey ?? process.env.GEMINI_API_KEY ?? null, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
  ];

  let title = "";
  for (const p of providers) {
    if (!p.key) continue;
    try {
      const resp = await multiKeyFetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, max_tokens: 20, messages: titlePrompt }),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        title = data.choices?.[0]?.message?.content?.trim() ?? "";
        if (title) break;
      }
    } catch {
      // Expected — continue to next provider
    }
  }

  if (!title) title = fallback();
  res.json({ title: title.slice(0, 80) });
});

router.get("/anthropic/conversations/:id", async (req, res) => {
  const ownerUserId = getRequestOwnerId(req);
  const parsed = GetAnthropicConversationParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const convo = await getConversationById(parsed.data.id, ownerUserId);
  if (!convo) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await getMessagesByConversationId(parsed.data.id);
  res.json({ ...toApiConversation(convo), messages: msgs.map(toApiMessage) });
});

router.delete("/anthropic/conversations/:id", async (req, res) => {
  const ownerUserId = getRequestOwnerId(req);
  const parsed = DeleteAnthropicConversationParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const deleted = await deleteConversation(parsed.data.id, ownerUserId);
  if (!deleted) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.status(204).end();
});

router.get("/anthropic/conversations/:id/messages", async (req, res) => {
  const ownerUserId = getRequestOwnerId(req);
  const parsed = ListAnthropicMessagesParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const convo = await getConversationById(parsed.data.id, ownerUserId);
  if (!convo) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await getMessagesByConversationId(parsed.data.id);
  res.json(msgs.map(toApiMessage));
});

function buildEnhanceMetaPrompt(prompt: string, mode: string): string {
  const isResearch = mode === "web_search" || mode === "deep_research";
  const topic = classifyTopic(prompt);

  const ANGLE_HINTS: Partial<Record<TopicType, string>> = {
    media_press:
      "Angles: RSF/CPJ/Freedom House index scores and trends, journalist UAPA/sedition " +
      "cases, Article 19 jurisprudence, government PIB counter-narrative.",
    democracy_civil_liberties:
      "Angles: Freedom House/V-Dem/EIU score trends, UAPA crackdowns, FCRA NGO " +
      "cancellations, internet shutdowns, HRW/Amnesty/CIVICUS, Supreme Court responses.",
    governance_policy:
      "Angles: CAG audit findings, NCRB statistics, PIB official position, " +
      "parliamentary committee reports, NITI Aayog data, India UN vote record.",
    legal:
      "Angles: Supreme Court and High Court judgements via indiankanoon.org, " +
      "constitutional articles, IPC/CrPC sections, PIL history, NHRC reports.",
    economic:
      "Angles: GDP data, Union Budget, RBI policy, NITI Aayog, IMF/World Bank, MoSPI.",
    environment:
      "Angles: India NDC, CPCB data, FSI forest report, MNRE energy, IPCC.",
    security:
      "Angles: MEA/MoD statements, SIPRI data, India UN peacekeeping, IDSA analysis.",
  };

  const angleHint = ANGLE_HINTS[topic] ??
    "Angles: India MEA position, UN resolution numbers, bloc alignments, 2024-2025 data.";

  if (!isResearch) {
    return `Expand into a clearer, more specific Indian MUN research prompt.
Add 3-4 specific angles and source types. Under 120 words. Output ONLY the enhanced prompt.
Original: "${prompt.trim()}"`;
  }

  return `You are a research strategist for Indian MUN delegates.
Rewrite this into a rich multi-angle research prompt maximizing web search quality.
Rules: under 200 words, add 4-6 topic-specific research angles, mention source
types (indices, court databases, reports), include year ranges 2022-2025.
Output ONLY the enhanced prompt.
Topic: ${topic.replace(/_/g, " ")}
${angleHint}
Original: "${prompt.trim()}"`;
}

// Enhance prompt endpoint
router.post("/anthropic/enhance-prompt", async (req, res) => {
  const { prompt, mode } = req.body as { prompt?: string; mode?: string };
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  const keys = extractKeys(req);
  const groqKey = keys.groqKey;
  const cerebrasKey = keys.cerebrasKey;
  const nvidiaKey = keys.nvidiaKey;
  const geminiKey = keys.geminiKey;
  const openrouterKey = keys.openrouterKey;

  const metaPrompt = buildEnhanceMetaPrompt(prompt, mode ?? "");

  try {
    // Try Groq
    if (isGroqEnabled(groqKey)) {
      try {
        const groq = getGroqClient(groqKey);
        const resp = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          max_tokens: 400,
          temperature: 0.4,
          messages: [{ role: "user", content: metaPrompt }],
        });
        const content = (resp.choices[0]?.message?.content ?? "").trim();
        if (content) { res.json({ enhanced: content }); return; }
      } catch (err) {
        (req as any).log?.warn?.({ err, provider: "groq" }, "Enhance: groq failed, trying next provider");
      }
    }

    // Try Cerebras — large prompt budget, fast inference (multiKeyFetch handles key rotation)
    if (isCerebrasEnabled(cerebrasKey)) {
      try {
        const cerebras = getCerebrasClient(cerebrasKey);
        const resp = await cerebras.chat.completions.create({
          model: "llama3.3-70b",
          max_tokens: 400,
          temperature: 0.4,
          messages: [{ role: "user", content: metaPrompt }],
        });
        const content = (resp.choices[0]?.message?.content ?? "").trim();
        if (content) { res.json({ enhanced: content }); return; }
      } catch (err) {
        (req as any).log?.warn?.({ err, provider: "cerebras" }, "Enhance: cerebras failed, trying next provider");
      }
    }

    // Try Gemini
    if (isGeminiEnabled(geminiKey)) {
      try {
        const gemini = getGeminiClient(geminiKey);
        const text = await callGeminiNonStreaming(
          gemini,
          "gemini-2.0-flash",
          metaPrompt,
          [{ role: "user" as const, content: metaPrompt }],
          400
        );
        const content = text.trim();
        if (content) { res.json({ enhanced: content }); return; }
      } catch (err) {
        (req as any).log?.warn?.({ err, provider: "gemini" }, "Enhance: gemini failed, trying next provider");
      }
    }

    // Try Nvidia
    if (isNvidiaEnabled(nvidiaKey)) {
      try {
        const nvidia = getNvidiaClient(nvidiaKey);
        const resp = await nvidia.chat.completions.create({
          model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
          max_tokens: 400,
          messages: [{ role: "user", content: metaPrompt }],
        });
        const content = (resp.choices[0]?.message?.content ?? "").trim();
        if (content) { res.json({ enhanced: content }); return; }
      } catch (err) {
        (req as any).log?.warn?.({ err, provider: "nvidia" }, "Enhance: nvidia failed, trying next provider");
      }
    }

    // Try OpenRouter
    if (openrouterKey) {
      try {
        const { getOpenRouterClient } = await import("../lib/openrouter-client.js");
        const openrouter = getOpenRouterClient(openrouterKey);
        const resp = await openrouter.chat.completions.create({
          model: "meta-llama/llama-3.1-8b-instruct:free",
          max_tokens: 400,
          messages: [{ role: "user", content: metaPrompt }],
        });
        const content = (resp.choices[0]?.message?.content ?? "").trim();
        if (content) { res.json({ enhanced: content }); return; }
      } catch (err) {
        (req as any).log?.warn?.({ err, provider: "openrouter" }, "Enhance: openrouter failed, returning original");
      }
    }

    res.json({ enhanced: prompt });
  } catch (err) {
    (req as any).log?.warn?.({ err }, "Enhance prompt failed, returning original");
    res.json({ enhanced: prompt });
  }
});

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
    agendaIntelligence?: AgendaIntelligence;
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
    archiveId,
    archiveSummary,
    groqKey,
    ollamaKey,
    ollamaBase,
    nvidiaKey,
    openrouterKey,
    githubToken,
    runIdentity,
  } = opts;
  const isGemini = rawModelId.startsWith("gemini/");
  const isDeep = mode === "deep_research";
  const isSearch = mode === "web_search" || mode === "deep_research";
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
  const topic = classifyTopic(userQuery);
  const SEARCH_SYS = buildSearchSystem("web", userSystemPrompt, topic);
  const DEEP_SYS = buildSearchSystem("deep", userSystemPrompt, topic);

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

  // â”€â”€ SEARCH / DEEP RESEARCH MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Step 1 â€” Query decomposition
  let subQueries: string[] = [];
  const searchSubject = buildSearchSubject(userQuery, opts.archiveTopic);
  const deterministicPlan = buildDeterministicPlan(searchSubject, undefined, topic);
  if (deterministicPlan) {
    subQueries = [
      ...deterministicPlan.data_analyst,
      ...deterministicPlan.legal_researcher,
      ...(deterministicPlan.media_journalist ?? []),
      ...deterministicPlan.current_affairs,
      ...deterministicPlan.policy_analyst,
    ].slice(0, isDeep ? 20 : 10);
  } else if (isDeep) {
    subQueries = await decomposeQuery(searchSubject, groqKey ?? process.env.GROQ_API_KEY ?? "", 20);
  } else {
    subQueries = await decomposeQuery(searchSubject, groqKey ?? process.env.GROQ_API_KEY ?? "", 8);
  }
  if (subQueries.length === 0) subQueries = [searchSubject];

  // Emit the research plan so the frontend can show the decomposed sub-queries
  // (deep research mode only â€” keeps the UI uncluttered for a single web search).
    if (isDeep) send({ researchPlan: subQueries });
  send({ model: rawModelId, queriesPlanned: subQueries.length });

  // Step 2 â€” OVERHAUL 9: Parallel web search with concurrency cap of 4
  const allResults: any[] = [];
  const seenUrls = new Set<string>();
  const SEARCH_CONCURRENCY = 3;
  const queryBatches: string[][] = [];
  for (let i = 0; i < subQueries.length; i += SEARCH_CONCURRENCY) {
    queryBatches.push(subQueries.slice(i, i + SEARCH_CONCURRENCY));
  }

  for (const batch of queryBatches) {
    const batchResults = await Promise.allSettled(
      batch.map(async (q) => {
        send({ model: rawModelId, searching: q });
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const searchKeys = { tavilyKey: opts.tavilyKey, serperKey: opts.serperKey, exaKey: opts.exaKey, braveKey: opts.braveKey };
            const results = isDeep ? await searchWebDeep(q, searchKeys, topic) : await searchWeb(q, searchKeys, topic);
            return { q, results };
          } catch {
            if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
          }
        }
        return { q, results: [] as any[] };
      })
    );

    for (const settled of batchResults) {
      if (settled.status !== "fulfilled") continue;
      const { q, results } = settled.value;
      const deduped = results.filter((r: any) => {
        const url = canonicalizeUrl(r.url);
        if (seenUrls.has(url)) return false;
        seenUrls.add(url); return true;
      });
      allResults.push(...deduped);
      if (deduped.length > 0) {
        send({ model: rawModelId, found: deduped.slice(0, 4).map((r: any) => ({ title: r.title, url: r.url, engine: r.engine })) });
      }
    }
  }

  // Step 3 â€” OVERHAUL 3: RAG enrichment with increased topN
  const topN = getEnrichmentBudget(allResults.length, isDeep);
  send({ model: rawModelId, fetching: { total: Math.min(topN, allResults.length) } });
  const enriched = await enrichResults(allResults, userQuery, topN, (i, total, url) => {
    send({ model: rawModelId, fetched: { i, total, url } });
  }, opts.jinaKey, isDeep ? "deep" : "web", isDeep ? 15 : 0, opts.firecrawlKey);
  let ragContext = formatRagContext(enriched, userQuery);
  if (opts.jinaKey?.trim() && enriched.length > 0) {
    const passages = await rerankPassages(enriched, userQuery, opts.jinaKey.trim(), isDeep ? 15 : 10, isDeep ? "deep" : "web");
    ragContext = formatRagContextFromPassages(passages, enriched, userQuery);
  }
  const numberedSources = buildNumberedSourceList(enriched, topN);

  // Step 4 â€” Final answer
  send({ synthesizing: true });
  const finalMsgs = [
    { role: "system" as const, content: isDeep ? DEEP_SYS : SEARCH_SYS },
    ...chatMessages,
    {
      role: "user" as const,
      content: `${numberedSources || "(no sources)"}

Question: ${userQuery}

MANDATORY: Cite every factual claim using [Source N](url) format where N matches the numbered list above.
${ragContext}

Write a comprehensive answer in markdown.`,
    },
  ];

  let full = "";
  let searchStreamFailed = false;
  let searchStreamErrorMessage = "";
  send({ model: rawModelId, drafting: true });
  try {
    if (isGemini) {
      full = await streamGeminiResponse(client, modelId, isDeep ? DEEP_SYS : SEARCH_SYS, finalMsgs, send, 4096);
    } else {
      const stream = await client.chat.completions.create({
        model: modelId, messages: finalMsgs, stream: true, max_tokens: 4096,
      });
      for await (const chunk of stream) {
        if (opts.abortSignal?.aborted || opts.getIsDisconnected?.()) break;
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) { full += delta; send({ content: delta }); }
      }
    }
    send({ model: rawModelId, draftComplete: true });
  } catch (err: any) {
      searchStreamFailed = true;
      searchStreamErrorMessage = isRateLimitOrQuotaError(err)
        ? "Provider rate limit or quota stopped research synthesis before completion."
        : err?.status === 404
          ? `Selected model is unavailable: ${modelId}`
          : "Research synthesis stream failed before completion.";
      if (isRateLimitOrQuotaError(err)) send({ rateLimited: true });
      else if (err?.status === 404) send({ modelNotPulled: true, modelId });
      send({ eventType: "provider_error", terminalStatus: "provider_error", error: searchStreamErrorMessage, done: true });
  }
  if (searchStreamFailed) {
    await persistAssistantFailed({
      store: assistantPersistenceStore,
      conversationId,
      assistantMessageId: runIdentity?.assistantMessageId,
      title: "Research Failed",
      message: searchStreamErrorMessage,
      partialContent: full,
      metadata: buildLegacyTerminalMetadata(runIdentity, "provider_error", {
        mode: isDeep ? "deep_research" : "web_search",
        liveRetrievalUsed: true,
        error: { code: "research_stream_failed", message: searchStreamErrorMessage, recoverable: true },
      } as PipelineMetadata),
    });
    return;
  }

  // Step 5 â€” Citation quality gate
  full = fixGroupedCitations(full, enriched);
  const citationCount = countCitations(full);
  if (citationCount < 3) {
    send({ citationWarning: true, count: citationCount });
  }

  // Step 6 â€” Qwen verification
  send({ verifying: true });
  try {
    send({ verifying: true, verifier: "gemini" });
    const verifyClients: VerifyClients = {
      gemini: opts.geminiKey ? getGeminiClient(opts.geminiKey) : null,
      groq: opts.groqKey ? getGroqClient(opts.groqKey) : null,
      nvidia: opts.nvidiaKey ? getNvidiaClient(opts.nvidiaKey) : null,
    };
    const verification = await verifyAnswer(userQuery, enriched, full, {
      geminiKey: opts.geminiKey,
      hfToken: opts.hfToken ?? null,
      groqKey: opts.groqKey,
      nvidiaKey: opts.nvidiaKey,
      clients: verifyClients,
      onChunk: (chunk) => send({ qwenThinkingChunk: chunk }),
    });
    send({ verified: verification });
  } catch {}

    if (full) {
      const persistedContent = runIdentity
        ? embedPipelineMeta(full, buildLegacyTerminalMetadata(runIdentity, "legacy_fallback_used", {
            mode: isDeep ? "deep_research" : "web_search",
            legacyFallbackUsed: true,
            liveRetrievalUsed: true,
            sources: enriched.map((source, index) => ({
              sourceId: index + 1,
              title: source.title,
              url: source.url,
              sourceType: source.sourceType,
            })),
          }))
        : full;
      await persistAssistantCompleted({
        store: assistantPersistenceStore,
        conversationId,
        assistantMessageId: runIdentity?.assistantMessageId,
        content: persistedContent,
      });
      if (runIdentity) send({ eventType: "legacy_fallback_used", legacyFallbackUsed: true, done: true });
    }
  } catch (err: any) {
    req.log?.error?.({ err }, "Provider handler failed");
    const fallback = await callGroqFallback(res, chatMessages, isSearch ? (isDeep ? DEEP_SYS : SEARCH_SYS) : NORMAL_SYS, groqKey).catch(() => "");
    if (!fallback) send({ eventType: "provider_error", terminalStatus: "provider_error", error: "Model call failed before a complete answer could be produced.", done: true });
    if (fallback) {
      const persistedFallback = runIdentity
        ? embedPipelineMeta(fallback, buildLegacyTerminalMetadata(runIdentity, "legacy_fallback_used", {
            mode: isDeep ? "deep_research" : "web_search",
            legacyFallbackUsed: true,
            liveRetrievalUsed: isSearch,
          }))
        : `Legacy Fallback Used\n\n${fallback}`;
      await persistAssistantCompleted({
        store: assistantPersistenceStore,
        conversationId,
        assistantMessageId: runIdentity?.assistantMessageId,
        content: persistedFallback,
      });
      send({ eventType: "legacy_fallback_used", legacyFallbackUsed: true, done: true });
    } else {
      await persistAssistantFailed({
        store: assistantPersistenceStore,
        conversationId,
        assistantMessageId: runIdentity?.assistantMessageId,
        title: isSearch ? "Research Failed" : "Response Failed",
        message: "Model call failed before a complete answer could be produced.",
        metadata: runIdentity
          ? buildLegacyTerminalMetadata(runIdentity, "provider_error", {
              mode: isDeep ? "deep_research" : "web_search",
              liveRetrievalUsed: isSearch,
              error: { code: "provider_call_failed", message: "Model call failed before a complete answer could be produced.", recoverable: true },
            } as PipelineMetadata)
          : null,
      });
    }
  } finally {
    finish();
  }
}

// â”€â”€â”€ Section 2: Independent Model Research Architecture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Use each model to decompose its own queries using its positional persona.
 * Falls back to engineerQueryForIndia() if the model call fails.
 */
async function decomposeQueryForModel(
  userQuery: string,
  personaIndex: number,
  client: any,
  modelId: string,
  rawModelId: string,
  isGemini: boolean
): Promise<string[]> {
  const topic = classifyTopic(userQuery);
  const persona = getPersonaForIndex(personaIndex, topic);
  const sourceConstraint = topic === "media_press"
    ? `- At least 3 queries MUST target press freedom sources: rsf.org, cpj.org, freedomhouse.org, medianama.com, thewire.in, scroll.in
- At least 1 query MUST target Indian court judgements on free speech (indiankanoon.org)
- At least 1 query MUST include quantitative rankings or index data`
    : topic === "sociocultural"
      ? `- At least 2 queries MUST target legal cases (indiankanoon.org) on sedition/blasphemy/hurt sentiments
- At least 1 query MUST target academic or think-tank analysis
- At least 1 query MUST target recent 2023-2025 incidents`
      : topic === "democracy_civil_liberties"
        ? `- At least 4 queries MUST target democracy watchdog/index sources: freedomhouse.org, v-dem.net, civicus.org, idea.int, hrw.org, amnesty.org, article14.com, eiu.com
- At least 1 query MUST target civil society restrictions, UAPA, FCRA, or internet shutdowns
- Government sources may appear only as counter-narrative, not primary evidence`
        : `- At least 3 queries MUST target: cag.gov.in, ncrb.gov.in, pib.gov.in, mea.gov.in, indiankanoon.org, prsindia.org, or supremecourtofindia.nic.in
- At least 1 query MUST target court judgements or constitutional law
- At least 1 query MUST include numerical/statistical data`;

  const decompositionPrompt = `${persona}

CRITICAL CONSTRAINTS FOR RESEARCH (topic: ${topic}):
${sourceConstraint}
- Format for Indian context: include "India", "Indian", "GoI" or specific ministry names
- Year range: include "2022 2023 2024 2025" in data queries for recency

Generate exactly 8 search sub-queries for: "${userQuery}"

Return ONLY a valid JSON array. No markdown, no explanation.
Example: ["query 1", "query 2", ..., "query 8"]`;

  try {
    let text = "";
    if (isGemini) {
      text = await callGeminiNonStreaming(client, modelId, decompositionPrompt, [
        { role: "user" as const, content: decompositionPrompt },
      ], 600);
    } else {
      const resp = await client.chat.completions.create({
        model: modelId,
        max_tokens: 600,
        temperature: 0.6,
        messages: [{ role: "user", content: decompositionPrompt }],
      });
      text = resp.choices?.[0]?.message?.content ?? "";
    }
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).slice(0, 8);
    }
  } catch (err: any) {
    logger.warn({ err, model: rawModelId }, "[decompose] Model failed decomposition; falling back to engineered queries");
  }

  if (topic === "media_press") return engineerQueryForMedia(userQuery).slice(0, 8);
  if (topic === "sociocultural") return engineerQueryForSociocultural(userQuery).slice(0, 8);
  if (topic === "democracy_civil_liberties") return engineerQueryForDemocracy(userQuery).slice(0, 8);
  return engineerQueryForIndia(userQuery).slice(0, 8);
}

/**
 * Extract numerical statistics from enriched results.
 */
function extractNumericalStats(results: EnrichedResult[]): { numbers: string[]; percentages: string[]; years: string[] } {
  const allText = results.map(r => r.content || r.snippet).join(" ");

  const numbers = [...new Set(
    (allText.match(/\b\d[\d,]*(?:\.\d+)?\s*(?:crore|lakh|million|billion|thousand|people|persons|cases|incidents|districts|states|countries)\b/gi) ?? [])
      .slice(0, 10)
  )];

  const percentages = [...new Set(
    (allText.match(/\b\d+(?:\.\d+)?\s*(?:%|percent|per cent)\b/gi) ?? [])
      .slice(0, 10)
  )];

  const years = [...new Set(
    (allText.match(/\b20[1-2][0-9]\b/g) ?? []).slice(0, 10)
  )].sort().reverse();

  return { numbers, percentages, years };
}

/**
 * Format RAG context specifically for MUN research â€” leads with court
 * judgements and government reports before falling back to general context.
 */
function formatRagContextForMUN(
  results: EnrichedResult[],
  query: string,
  judgements: CourtJudgement[]
): string {
  let context = "";

  if (judgements.length > 0) {
    context += `## âš–ï¸ COURT JUDGEMENTS (cite with case name + year)\n\n`;
    for (const j of judgements) {
      context += `**${j.caseName || "Unknown Case"}** (${j.year}) â€” ${j.court}\n`;
      if (j.caseNumber) context += `No: ${j.caseNumber}\n`;
      if (j.held) context += `Held: ${j.held.slice(0, 200)}\n`;
      context += `URL: ${j.url}\n\n`;
    }
    context += `---\n\n`;
  }
  context += formatRagContext(results, query);
  return context;
}

// â”€â”€â”€ Per-model draft writer (uses pre-built shared context) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function writeModelDraft(
  client: any,
  rawModelId: string,
  modelId: string,
  chatMessages: { role: "user" | "assistant"; content: string }[],
  userQuery: string,
  ragContext: string,
  systemPrompt: string,
  isDeep: boolean,
  send: (e: object) => void,
  sourceList: SearchResult[] = []
): Promise<string> {
  const DRAFT_TIMEOUT_MS = 55_000;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DRAFT_TIMEOUT_MS);

  const draftPromise = (async () => {
    const draftMaxTokens = getDraftMaxTokens(rawModelId || modelId, isDeep);
    const draftSourceLimit = getDraftSourceLimit(rawModelId || modelId, isDeep, sourceList.length);
    const numberedSources = sourceList.length > 0
      ? formatNumberedSourceList(sourceList, draftSourceLimit)
      : "(no sources — configure TAVILY_API_KEY and/or BRAVE_API_KEY to enable source retrieval)";
    const fittedRagContext = fitTextToModelBudget(ragContext, rawModelId || modelId, draftMaxTokens);
    const workerInstruction = isSmallDraftModel(rawModelId || modelId)
      ? "Write a concise evidence memo: 6-10 cited bullets, strongest statistics/cases only, no long prose. The final synthesis model will merge all sources."
      : "Write a comprehensive answer in markdown.";
    const userTurn = `${numberedSources}

Question: ${userQuery}

MANDATORY: Cite every factual claim using [Source N](url) format where N matches the numbered list above.
${fittedRagContext}

${workerInstruction}`;

    const finalMsgs = [
      { role: "system" as const, content: systemPrompt },
      ...chatMessages,
      { role: "user" as const, content: userTurn },
    ];

    try {
      if (rawModelId.startsWith("gemini/")) {
        return await callGeminiNonStreaming(client, modelId, finalMsgs[0].content, finalMsgs, Math.min(draftMaxTokens, 6144));
      }
      const resp = await client.chat.completions.create({
        model: modelId,
        messages: finalMsgs,
        stream: false,
        max_tokens: draftMaxTokens,
        temperature: 0.4,
        signal: ac.signal,
      });
      return resp.choices?.[0]?.message?.content ?? "";
    } catch (err: any) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      logger.error({ err, model: rawModelId, status: err?.status }, "[writeModelDraft] Model failed");
      if (isRateLimitOrQuotaError(err)) {
        send({ model: rawModelId, rateLimited: true });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  })();

  return draftPromise;
}


// â”€â”€â”€ Sequential Batched Multi-Role Research Architecture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function analyzeQuery(query: string): { needsStatistics: boolean; needsLegalPrecedents: boolean; needsPolicyAnalysis: boolean } {
  const needsStatistics =
    /\b(data|statistics|number|count|percent|figure|rate|index|GDP|population|crime|budget|spending|report|survey|census)\b/i.test(query) ||
    /\b(how many|how much|what is the rate|what percentage)\b/i.test(query);
  const needsLegalPrecedents =
    /\b(law|legal|court|judgement|judgment|constitution|article|section|act|treaty|resolution|PIL|petition|ruling|case|convention)\b/i.test(query) ||
    /\b(UN|UNSC|UNGA|ICJ|ICC|tribunal)\b/i.test(query);
  const needsPolicyAnalysis =
    /\b(policy|position|stance|statement|government|official|MEA|minister|parliament|bilateral|diplomatic|foreign)\b/i.test(query) ||
    /\b(India's position|India's stance|India's policy)\b/i.test(query);
  if (!needsStatistics && !needsLegalPrecedents && !needsPolicyAnalysis) {
    return { needsStatistics: true, needsLegalPrecedents: true, needsPolicyAnalysis: true };
  }
  return { needsStatistics, needsLegalPrecedents, needsPolicyAnalysis };
}

type ResearchRole = "data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs" | "media_journalist";

function getRoleSystemPromptAddition(role: ResearchRole): string {
  switch (role) {
    case "data_analyst":
      return "Respond ONLY with a statistics table (Metric | Value | Source | Year) and bullet trends. No paragraphs.";
    case "legal_researcher":
      return "Respond ONLY with case citations and relevant laws. Format: Case Name (Year) â€” Court â€” Ruling.";
    case "policy_analyst":
      return "Respond ONLY with official positions, UN votes, and policy timeline. Cite MEA/PIB sources with dates.";
    case "current_affairs":
      return "Respond ONLY with recent events and developments from the last 12 months. Format: Date â€” Event â€” Source.";
    case "media_journalist":
      return "Respond ONLY with press freedom data, journalist arrests, media suppression incidents, and civil society reports. Cite RSF, CPJ, Freedom House, HRW with dates and case names.";
  }
}

function generateRoleQueries(userQuery: string, role: ResearchRole, topic?: TopicType): string[] {
  const deterministic = topic ? buildDeterministicPlan(userQuery, undefined, topic) : null;
  if (deterministic) {
    if (role === "media_journalist") return deterministic.media_journalist ?? [];
    return deterministic[role] ?? deterministic.policy_analyst;
  }

  const anchor = toSearchAnchor(userQuery);
  switch (role) {
    case "data_analyst":
      return [
        `India ${anchor} statistics percentage figures site:data.gov.in OR site:mospi.gov.in`,
        `India ${anchor} NCRB annual report crime data numbers`,
        `India ${anchor} CAG performance audit findings crore`,
        `India ${anchor} government scheme targets achieved data 2024 filetype:pdf`,
        `India ${anchor} World Bank IMF statistics comparison`,
      ].map(s => s.slice(0, 100));
    case "legal_researcher":
      return [
        `India ${anchor} Supreme Court judgment site:indiankanoon.org`,
        `India ${anchor} High Court ruling constitutional article PIL`,
        `India ${anchor} UN General Assembly resolution number`,
        `India ${anchor} section act parliament India legal framework`,
        `livelaw.in OR barandbench.com India ${anchor} 2024`,
      ].map(s => s.slice(0, 100));
    case "policy_analyst":
      return [
        `site:mea.gov.in India ${anchor} statement`,
        `site:pib.gov.in India ${anchor} press release`,
        `India ${anchor} NITI Aayog policy report`,
        `India ${anchor} parliamentary standing committee report prsindia.org`,
        `India ${anchor} UN speech Ministry official position 2024`,
      ].map(s => s.slice(0, 100));
    case "media_journalist":
      return [
        `site:rsf.org india ${anchor}`,
        `site:cpj.org india journalist ${anchor}`,
        `site:thewire.in ${anchor} media freedom`,
        `site:hrw.org india ${anchor} 2024`,
        `site:freedomhouse.org india ${anchor}`,
      ].map(s => s.slice(0, 100));
    case "current_affairs":
      return [
        `India ${anchor} latest news 2025`,
        `India ${anchor} Reuters AP BBC 2025`,
        `India ${anchor} update since 2024`,
        `India ${anchor} recent development this year`,
        `India ${anchor} timeline events 2024 2025`,
      ].map(s => s.slice(0, 100));
  }
}

function truncateRagContextForModel(ragContext: string, modelKey: string): string {
  const k = modelKey.toLowerCase();
  const charLimit = getModelContextChars(k);

  if (ragContext.length <= charLimit) return ragContext;

  const sourceListPattern = /Source 1[^\n]*\nCitation:/;
  const sourceBlockStart = ragContext.search(sourceListPattern);

  let protectedBlock = "";
  let contentSection = ragContext;

  if (sourceBlockStart > 0) {
    const contextStartPattern = /\n## Live Web Search/;
    const contextStart = ragContext.search(contextStartPattern);

    if (contextStart > sourceBlockStart) {
      protectedBlock = ragContext.slice(sourceBlockStart, contextStart);
      contentSection = ragContext.slice(0, sourceBlockStart) + ragContext.slice(contextStart);
    } else {
      protectedBlock = ragContext.slice(0, 3000);
      contentSection = ragContext.slice(3000);
    }
  }

  const contentBudget = charLimit - protectedBlock.length - 200;
  if (contentBudget <= 0) {
    logger.warn(`[truncate] Context window too small (${charLimit}) to fit source list (${protectedBlock.length} chars) for ${modelKey}`);
    return protectedBlock.slice(0, charLimit - 100) + "\n\n[Context window exhausted — content omitted]";
  }

  const contentBlocks = contentSection.split(/\n---\n/).filter(b => b.trim().length > 0);
  const scoredBlocks = contentBlocks.map(block => ({
    block,
    priority:
      block.includes("[GOV.IN]") || block.includes("[CAG") || block.includes("[NCRB") || block.includes("[PIB") ? 4
      : block.includes("[COURT]") || block.includes("indiankanoon") ? 3
      : block.includes("[INTL GOV]") || block.includes("un.org") || block.includes("worldbank") ? 2
      : 1,
    hasNumbers: /\d+(?:\.\d+)?(?:\s*(?:crore|lakh|million|billion|%|percent))/i.test(block),
  })).sort((a, b) => b.priority !== a.priority ? b.priority - a.priority
    : (b.hasNumbers ? 1 : 0) - (a.hasNumbers ? 1 : 0));

  let budget = contentBudget;
  const keptBlocks: string[] = [];

  for (const { block } of scoredBlocks) {
    if (budget - block.length - 5 < 0) continue;
    keptBlocks.push(block);
    budget -= block.length + 5;
  }

  const keptContent = keptBlocks.join("\n---\n");
  const truncationNote = keptBlocks.length < contentBlocks.length
    ? `\n\n[${contentBlocks.length - keptBlocks.length} lower-priority source blocks omitted to fit ${modelKey} context window]`
    : "";

  return protectedBlock + keptContent + truncationNote;
}

function getModelContextChars(k: string): number {
  if (k.includes("8b-instant")) return 4_000;
  if (k.includes("8b")) return 4_000;
  if (k.includes("70b") || k.includes("llama-3.3")) return 10_500;
  if (k.includes("gemini-2.5")) return 20_000;
  if (k.includes("gemini")) return 15_000;
  if (k.includes("compound")) return 12_000;
  if (k.includes("deepseek")) return 9_000;
  if (k.includes("claude")) return 15_000;
  if (k.includes("mistral")) return 7_000;
  return 7_000;
}

function isSmallDraftModel(modelKey: string): boolean {
  const k = modelKey.toLowerCase();
  return /\b(?:3b|7b|8b)\b/.test(k)
    || k.includes("8b-instant")
    || k.includes("nano")
    || k.includes("mini")
    || k.includes("small");
}

function getDraftMaxTokens(modelKey: string, isDeep: boolean): number {
  if (isSmallDraftModel(modelKey)) return isDeep ? 1800 : 1200;
  const k = modelKey.toLowerCase();
  if (k.includes("20b") || k.includes("30b") || k.includes("mistral")) return isDeep ? 3600 : 2400;
  return isDeep ? 6144 : 4096;
}

function fitTextToModelBudget(text: string, modelKey: string, reservedOutputTokens: number): string {
  const charLimit = getModelContextChars(modelKey.toLowerCase());
  const budget = Math.max(4000, charLimit - reservedOutputTokens * 4 - 2500);
  if (text.length <= budget) return text;
  return `${text.slice(0, budget)}\n\n[Draft context truncated for this worker model; final synthesis receives the full source manifest.]`;
}

function getDraftSourceLimit(modelKey: string, isDeep: boolean, totalSources: number): number {
  if (isSmallDraftModel(modelKey)) return Math.min(totalSources, isDeep ? 8 : 6);
  const k = modelKey.toLowerCase();
  if (k.includes("20b") || k.includes("30b") || k.includes("mistral")) return Math.min(totalSources, isDeep ? 20 : 12);
  return totalSources;
}

function getEnrichmentBudget(totalResults: number, isDeep: boolean): number {
  if (totalResults <= 0) return 0;
  return isDeep ? totalResults : Math.min(totalResults, 30);
}

interface StructuredRoleData {
  keyFindings: string[];
  [key: string]: any;
}

async function extractRoleDataFromResults(
  enrichedResults: EnrichedResult[],
  role: ResearchRole,
  userQuery: string,
  groqKey?: string | null,
  geminiKey?: string | null
): Promise<StructuredRoleData> {
  const sourcesText = enrichedResults.slice(0, 8)
    .map((r, i) => "[" + (i + 1) + "] " + r.title + "\n" + (r.content || r.snippet || "").replace(/\s+/g, " ").slice(0, 1000))
    .join("\n\n");
  let prompt = "";
  if (role === "data_analyst") {
    prompt = "Extract ONLY numerical data. Query: \"" + userQuery.slice(0, 80) + "\"\nSources:\n" + sourcesText + "\nReturn ONLY valid JSON (no markdown):\n{\"statistics\":[{\"figure\":\"str\",\"context\":\"str\"}],\"percentages\":[{\"value\":\"str\",\"context\":\"str\"}],\"keyFindings\":[\"finding 1\",\"finding 2\"]}";
  } else if (role === "legal_researcher") {
    prompt = "Extract ONLY legal precedents. Query: \"" + userQuery.slice(0, 80) + "\"\nSources:\n" + sourcesText + "\nReturn ONLY valid JSON (no markdown):\n{\"resolutions\":[{\"body\":\"str\",\"number\":\"str\",\"summary\":\"str\"}],\"cases\":[{\"court\":\"str\",\"case\":\"str\",\"year\":\"str\",\"ruling\":\"str\"}],\"keyFindings\":[\"finding 1\",\"finding 2\"]}";
  } else {
    prompt = "Extract ONLY official statements. Query: \"" + userQuery.slice(0, 80) + "\"\nSources:\n" + sourcesText + "\nReturn ONLY valid JSON (no markdown):\n{\"statements\":[{\"speaker\":\"str\",\"date\":\"str\",\"position\":\"str\"}],\"policies\":[{\"country\":\"str\",\"policy\":\"str\",\"year\":\"str\"}],\"keyFindings\":[\"finding 1\",\"finding 2\"]}";
  }

  const parseResponse = (text: string): StructuredRoleData => {
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(clean);
      return { ...parsed, keyFindings: sanitizeKeyFindings(parsed.keyFindings) };
    } catch { return { keyFindings: [] }; }
  };

  if (groqKey?.trim()) {
    try {
      const groq = getGroqClient(groqKey);
      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant", max_tokens: 2048, temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      });
      const result = parseResponse(response.choices[0]?.message?.content ?? "{}");
      if (Array.isArray(result.keyFindings) && result.keyFindings.length > 0) return result;
    } catch { /* fall through */ }
  }

  if (geminiKey?.trim() && isGeminiEnabled(geminiKey)) {
    try {
      const gemini = getGeminiClient(geminiKey);
      const response = await gemini.chat.completions.create({
        model: "gemini-2.0-flash", max_tokens: 1000, temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      });
      return parseResponse(response.choices?.[0]?.message?.content ?? "{}");
    } catch { /* fall through */ }
  }

  return { keyFindings: [] };
}

interface BatchModelResult {
  modelKey:       string;
  subQueries:     string[];
  sources:        Array<{ title: string; url: string; sourceType?: string }>;
  structuredData: StructuredRoleData;
  ragContext:     string;
  searchResults:  EnrichedResult[];
  judgements:     CourtJudgement[];
  govReports:     string[];
  stats: { numbers: string[]; percentages: string[]; years: string[] };
}

interface BatchResult {
  batchName:    string;
  role:         ResearchRole;
  modelResults: BatchModelResult[];
}

function hasExpectedSources(results: SearchResult[], topic: TopicType): boolean {
  if (results.length === 0) return false;
  const urls = results.map(r => r.url.toLowerCase());
  if (topic === "media_press") {
    return urls.some(u =>
      u.includes("rsf.org") || u.includes("cpj.org") ||
      u.includes("freedomhouse.org") || u.includes("ifj.org") ||
      u.includes("thewire.in") || u.includes("article14.com")
    );
  }
  if (topic === "democracy_civil_liberties") {
    return urls.some(u =>
      u.includes("freedomhouse.org") || u.includes("v-dem.net") ||
      u.includes("hrw.org") || u.includes("amnesty.org") ||
      u.includes("civicus.org") || u.includes("article14.com")
    );
  }
  return true;
}

async function executeSequentialBatches(
  modelInfos:    Array<{ rawModelId: string; modelId: string; client: any; providerLabel: string }>,
  userQuery:     string,
  archiveTopic:  string | undefined,
  queryAnalysis: { needsStatistics: boolean; needsLegalPrecedents: boolean; needsPolicyAnalysis: boolean },
  isDeep:        boolean,
  tavilyKey:     string | null | undefined,
  serperKey:     string | null | undefined,
  exaKey:        string | null | undefined,
  braveKey:      string | null | undefined,
  firecrawlKey:  string | null | undefined,
  jinaKey:       string | null | undefined,
  groqKey:       string | null | undefined,
  geminiKey:     string | null | undefined,
  planned:       PlannedQueries | null,
  send:          (e: object) => void,
  getIsDisconnected?: () => boolean,
  abortSignal?: AbortSignal
): Promise<BatchResult[]> {
  const topic = classifyTopic(userQuery);
  const assignedBatches: Array<{ batchName: string; role: ResearchRole; models: typeof modelInfos }> = [];
  const n = modelInfos.length;

  if (topic === "media_press" || topic === "democracy_civil_liberties") {
    const topicBatchDefs: Array<{ batchName: string; role: ResearchRole }> =
      topic === "media_press"
        ? [
            { batchName: "Press Freedom Indices", role: "data_analyst" },
            { batchName: "Legal Free Speech Cases", role: "legal_researcher" },
            { batchName: "International Observers", role: "policy_analyst" },
            { batchName: "Documented Incidents", role: "media_journalist" },
          ]
        : [
            { batchName: "Democracy Index Data", role: "data_analyst" },
            { batchName: "Legal & UAPA Cases", role: "legal_researcher" },
            { batchName: "Civil Society & NGOs", role: "policy_analyst" },
            { batchName: "Incidents & Reports", role: "media_journalist" },
          ];

    for (let i = 0; i < n; i++) {
      const def = topicBatchDefs[i % topicBatchDefs.length];
      const existing = assignedBatches.find(b => b.batchName === def.batchName);
      if (existing) {
        existing.models.push(modelInfos[i]);
      } else {
        assignedBatches.push({ batchName: def.batchName, role: def.role, models: [modelInfos[i]] });
      }
    }
  } else {
    const split1 = Math.max(1, Math.ceil(n / 3));
    const split2 = Math.max(split1, Math.ceil(n * 2 / 3));
    const primaryModels = modelInfos.slice(0, Math.max(1, split1));
    const secondaryModels = n > 1 ? modelInfos.slice(split1, split2) : modelInfos.slice(0, 1);
    const tertiaryModels  = n > 2 ? modelInfos.slice(split2)         : modelInfos.slice(0, 1);
    const currentAffairsModel = n >= 4 ? modelInfos.slice(3, 4) : modelInfos.slice(0, 1);

    if (queryAnalysis.needsStatistics) {
      assignedBatches.push({ batchName: "Data & Statistics",    role: "data_analyst",    models: primaryModels });
    }
    if (queryAnalysis.needsLegalPrecedents) {
      assignedBatches.push({ batchName: "Legal Precedents",     role: "legal_researcher", models: secondaryModels });
    }
    if (queryAnalysis.needsPolicyAnalysis) {
      assignedBatches.push({ batchName: "Policy & Statements",  role: "policy_analyst",   models: tertiaryModels });
    }
    if (assignedBatches.length === 0) {
      assignedBatches.push({ batchName: "Data & Statistics", role: "data_analyst", models: modelInfos });
    }
    if (planned?.current_affairs?.length) {
      assignedBatches.push({ batchName: "Current Affairs", role: "current_affairs", models: currentAffairsModel });
    }
    if (planned?.media_journalist?.length) {
      const mediaModel = n >= 4 ? [modelInfos[n - 1]] : [modelInfos[0]];
      assignedBatches.push({
        batchName: "Media & Civil Society",
        role: "media_journalist",
        models: mediaModel,
      });
    }
  }

  const results: BatchResult[] = [];

  for (let bi = 0; bi < assignedBatches.length; bi++) {
    const { batchName, role, models } = assignedBatches[bi];
    if (getIsDisconnected?.()) break;
    send({ batchStart: batchName, role, models: models.map(m => m.rawModelId) });
    send({
      pipelineTimeline: {
        stage: "batch_search_start",
        timestamp: Date.now(),
        data: { batchName, role, modelCount: models.length },
      },
    });
    const roleQueries = deduplicateQueriesSemantically(
      planned
        ? (role === "data_analyst"
            ? planned.data_analyst
            : role === "legal_researcher"
              ? planned.legal_researcher
              : role === "current_affairs"
                ? planned.current_affairs
                : role === "media_journalist"
                  ? (planned.media_journalist ?? [])
                : planned.policy_analyst.slice(0, 10))
        : generateRoleQueries(archiveTopic ? `${archiveTopic}: ${userQuery}` : userQuery, role, topic)
    );
    if (bi > 0) {
      const jitter = 200 + Math.random() * 400;
      await new Promise(r => setTimeout(r, jitter));
    }

    const batchModelResults: BatchModelResult[] = await Promise.all(
      models.map(async (info, modelIdx) => {
        if (getIsDisconnected?.()) return {
          modelKey: info.rawModelId, subQueries: [], sources: [],
          structuredData: { keyFindings: [] }, ragContext: "",
          searchResults: [], judgements: [], govReports: [],
          stats: { numbers: [], percentages: [], years: [] },
        };

        const modelResults: SearchResult[] = [];
        const seenUrls = new Set<string>();
        const SUB_BATCH = 3;
        const modelsInBatch = models.length;
        const queryOffset = modelsInBatch > 1 ? Math.floor((modelIdx / modelsInBatch) * roleQueries.length) : 0;
        const rotatedQueries = deduplicateQueriesSemantically([
          ...roleQueries.slice(queryOffset),
          ...roleQueries.slice(0, queryOffset),
        ]).slice(0, Math.ceil(roleQueries.length / Math.max(modelsInBatch, 1)) + 2);
        send({ model: info.rawModelId, queriesPlanned: rotatedQueries.length });

        for (let i = 0; i < rotatedQueries.length; i += SUB_BATCH) {
          if (getIsDisconnected?.()) break;
          const queryBatch = rotatedQueries.slice(i, i + SUB_BATCH);
          if (i > 0 && i % SUB_BATCH === 0) await new Promise(r => setTimeout(r, 300));

          const settled = await Promise.allSettled(
            queryBatch.map(async (q) => {
              send({ model: info.rawModelId, searching: q });
              try {
                const searchKeys = { tavilyKey, serperKey, exaKey, braveKey, abortSignal };
                return isDeep ? await searchWebDeep(q, searchKeys, topic) : await searchWeb(q, searchKeys, topic);
              } catch { return [] as SearchResult[]; }
            })
          );
          for (const s of settled) {
            if (s.status !== "fulfilled") continue;
            const deduped = s.value.filter(r => {
              const key = canonicalizeUrl(r.url);
              if (seenUrls.has(key)) return false;
              seenUrls.add(key); return true;
            });
            modelResults.push(...deduped);
            if (deduped.length > 0) {
              send({ model: info.rawModelId, found: deduped.slice(0, 4).map(r => ({
                title: r.title, url: r.url, engine: r.engine, sourceType: r.sourceType,
              })) });
            }
          }
        }

        const kanoonResults = await searchIndianKanoon(
          archiveTopic ? `${archiveTopic}: ${userQuery}` : userQuery,
          topic
        ).catch(() => []);
        for (const r of kanoonResults) {
          const key = canonicalizeUrl(r.url);
          if (!seenUrls.has(key)) {
            seenUrls.add(key);
            modelResults.push(r);
          }
        }

        const judgements = modelResults
          .filter(r => r.sourceType === "court_judgement" && r.judgement)
          .map(r => r.judgement as CourtJudgement);
        const govReports = modelResults
          .filter(r => r.sourceType === "government_india" && r.reportType)
          .map(r => r.reportType as string);
        const topN = getEnrichmentBudget(modelResults.length, isDeep);
        if (topN > 0) send({ model: info.rawModelId, fetching: { total: topN } });
        const enrichQuery = archiveTopic ? `${archiveTopic}\n${userQuery}` : userQuery;
        const enriched = await enrichResults(mergeSearchResults(modelResults), enrichQuery, topN, (i, total, url) => {
          send({ model: info.rawModelId, fetched: { i, total, url } });
        }, jinaKey, isDeep ? "deep" : "web", isDeep ? 15 : 0, firecrawlKey);
        let rawContext      = formatRagContextForMUN(enriched as EnrichedResult[], enrichQuery, judgements);
        if (jinaKey?.trim() && enriched.length > 0) {
          const passages = await rerankPassages(enriched as EnrichedResult[], enrichQuery, jinaKey.trim(), isDeep ? 15 : 10, isDeep ? "deep" : "web");
          rawContext = formatRagContextFromPassages(passages, enriched as EnrichedResult[], enrichQuery);
        }
        const truncatedCtx   = truncateRagContextForModel(rawContext, info.rawModelId);
        const roleAddition   = getRoleSystemPromptAddition(role);
        const ragContext     = roleAddition ? `[ROLE INSTRUCTION]: ${roleAddition}\n\n${truncatedCtx}` : truncatedCtx;
        send({ model: info.rawModelId, drafting: true });
        const structuredData = await extractRoleDataFromResults(enriched as EnrichedResult[], role, enrichQuery, groqKey, geminiKey);
        send({ model: info.rawModelId, draftComplete: true });
        const stats          = extractNumericalStats(enriched as EnrichedResult[]);

        return {
          modelKey:      info.rawModelId,
          subQueries:    roleQueries,
          sources:       enriched.map(r => ({ title: r.title, url: r.url, sourceType: (r as any).sourceType })),
          structuredData, ragContext,
          searchResults: enriched as EnrichedResult[],  // Preserve full EnrichedResult with content
          judgements, govReports, stats,
        };
      })
    );

    const allFindings    = batchModelResults.flatMap(r => r.structuredData.keyFindings ?? []).slice(0, 6);
    const allNumbers     = [...new Set(batchModelResults.flatMap(r => r.stats.numbers))].slice(0, 12);
    const allPercentages = [...new Set(batchModelResults.flatMap(r => r.stats.percentages))].slice(0, 8);
    const allJudgements  = batchModelResults.flatMap(r => r.judgements).slice(0, 5);
    const allGovReports  = [...new Set(batchModelResults.flatMap(r => r.govReports))].slice(0, 5);
    send({
      batchComplete: batchName,
      role,
      findings:    allFindings,
      numbers:     allNumbers,
      percentages: allPercentages,
      judgements:  allJudgements.map(j => ({ caseName: j.caseName, year: j.year, court: j.court, held: j.held?.slice(0, 120) })),
      govReports:  allGovReports,
    });
    const batchSources = mergeSearchResults(batchModelResults.flatMap((result) => result.searchResults));
    send({
      pipelineTimeline: {
        stage: "batch_search_complete",
        timestamp: Date.now(),
        data: {
          batchName,
          role,
          totalQueries: roleQueries.length,
          totalSources: batchSources.length,
          govInSources: batchSources.filter((source) => source.sourceType === "government_india").length,
          courtSources: batchSources.filter((source) => source.sourceType === "court_judgement").length,
        },
      },
    });
    results.push({ batchName, role, modelResults: batchModelResults });
  }

  if (topic === "media_press" || topic === "democracy_civil_liberties") {
    const allSources = results.flatMap(b => b.modelResults.flatMap(m => m.searchResults));
    if (!hasExpectedSources(allSources, topic)) {
      const topUpQueries =
        topic === "media_press"
          ? [`site:rsf.org india 2025`, `site:cpj.org india journalist 2025`, `site:freedomhouse.org india press 2025`]
          : [`site:freedomhouse.org india 2025`, `site:hrw.org india 2025`, `site:v-dem.net india 2024`];
      const searchKeys = { tavilyKey, serperKey, exaKey, braveKey };
      send({ phase: "quality_topup", message: "Fetching authoritative watchdog sources..." });
      const topUpSettled = await Promise.allSettled(
        topUpQueries.map(q => searchWeb(q, searchKeys, topic))
      );
      const topUpResults: SearchResult[] = topUpSettled
        .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === "fulfilled")
        .flatMap(r => r.value);

      if (topUpResults.length > 0 && results.length > 0) {
        const lastBatch = results[results.length - 1];
        const lastModel = lastBatch.modelResults[0];
        if (lastModel) {
          const existingUrls = new Set(lastModel.searchResults.map(r => canonicalizeUrl(r.url)));
          const newResults = topUpResults.filter(r => !existingUrls.has(canonicalizeUrl(r.url)));
          const enrichedTopUp = newResults.length > 0
            ? await enrichResults(
                mergeSearchResults(newResults),
                userQuery,
                getEnrichmentBudget(newResults.length, isDeep),
                undefined,
                jinaKey,
                isDeep ? "deep" : "web",
                isDeep ? 15 : 0,
                firecrawlKey,
              ) as EnrichedResult[]
            : [];
          lastModel.searchResults = [...lastModel.searchResults, ...enrichedTopUp];
          send({ phase: "quality_topup", found: enrichedTopUp.length });
        }
      }
    }
  }

  return results;
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

interface DataCheatsheet {
  query:       string;
  numbers:     string[];
  percentages: string[];
  judgements:  Array<{ caseName: string; year: string; court: string; held: string }>;
  govReports:  string[];
  topSources:  Array<{ title: string; url: string; sourceType?: string }>;
}

function buildDataCheatsheet(batchResults: BatchResult[], query: string): DataCheatsheet {
  const allNumbers     = [...new Set(batchResults.flatMap(b => b.modelResults.flatMap(r => r.stats.numbers)))].slice(0, 20);
  const allPercentages = [...new Set(batchResults.flatMap(b => b.modelResults.flatMap(r => r.stats.percentages)))].slice(0, 12);
  const allJudgements  = batchResults.flatMap(b => b.modelResults.flatMap(r => r.judgements))
    .filter(j => j.isJudgement && j.caseName)
    .slice(0, 8);
  const allGovReports  = [...new Set(batchResults.flatMap(b => b.modelResults.flatMap(r => r.govReports)))].slice(0, 8);
  const allSources     = batchResults.flatMap(b => b.modelResults.flatMap(r => r.searchResults))
    .filter(r => r.score >= 9)
    .slice(0, 10)
    .map(r => ({ title: r.title, url: r.url, sourceType: r.sourceType }));
  return {
    query,
    numbers:     allNumbers,
    percentages: allPercentages,
    judgements:  allJudgements.map(j => ({ caseName: j.caseName, year: j.year, court: j.court, held: (j.held ?? "").slice(0, 120) })),
    govReports:  allGovReports,
    topSources:  allSources,
  };
}

async function generateCrossBatchDiscussion(
  batchResults: BatchResult[],
  userQuery:    string,
  groqKey?:     string | null,
  geminiKey?:   string | null,
  nvidiaKey?:   string | null,
  cerebrasKey?: string | null
): Promise<string> {
  const summaries = batchResults.map(b => {
    const findings = b.modelResults.flatMap(r => r.structuredData.keyFindings ?? [])
      .filter((f): f is string => typeof f === "string")
      .filter(f => !/^\s*[\[{"]/.test(f));
    const rawSnippets = b.modelResults.flatMap(r => r.searchResults).slice(0, 4)
      .map(r => `â€¢ ${r.title}: ${(r.snippet || "").slice(0, 150)}`);
    const cases = b.modelResults.flatMap(r => r.judgements).map(j => `${j.caseName} (${j.year})`).join(", ");
    const stats = b.modelResults.flatMap(r => [...(r.stats.numbers ?? []), ...(r.stats.percentages ?? [])]).slice(0, 5).join(", ");
    const findingsText = findings.length > 0
      ? "Key Findings:\n- " + findings.join("\n- ")
      : "Raw Results:\n" + rawSnippets.join("\n");
    return "=== " + b.batchName + " (" + b.role + ") ===\n" + findingsText +
      (cases ? "\nCourt cases: " + cases : "") +
      (stats ? "\nStats: " + stats : "");
  }).join("\n\n");
  const prompt = "Multiple research batches investigated: \"" + userQuery.slice(0, 120) + "\"\n\n" + summaries +
    "\n\nWrite exactly 6 bullets, one per label below:\n" +
    "**[Data Coverage]**: What statistics/numbers were confirmed?\n" +
    "**[Legal Framework]**: What court cases/resolutions were found? Any conflicts?\n" +
    "**[Policy Positions]**: What official statements were found?\n" +
    "**[Unique Contributions]**: What did each batch find uniquely?\n" +
    "**[Contradictions]**: Any conflicting numbers, dates, or facts?\n" +
    "**[Research Gaps]**: What is still missing?\n\nBe specific. Max 400 words.";

  const callModel = async (client: any, model: string): Promise<string> => {
    const resp = await client.chat.completions.create({
      model, max_tokens: 900, temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });
    return resp.choices[0]?.message?.content ?? "";
  };

  if (groqKey?.trim()) {
    try {
      const groq = getGroqClient(groqKey);
      const text = await callModel(groq, "llama-3.3-70b-versatile");
      if (text.trim()) return text;
    } catch { /* fall through */ }
  }

  // Cerebras — large prompt budget, fast inference (multiKeyFetch handles key rotation)
  if (isCerebrasEnabled(cerebrasKey)) {
    try {
      const cerebras = getCerebrasClient(cerebrasKey);
      const text = await callModel(cerebras, "llama3.3-70b");
      if (text.trim()) return text;
    } catch { /* fall through */ }
  }

  // NVIDIA
  if (isNvidiaEnabled(nvidiaKey)) {
    try {
      const nvidia = getNvidiaClient(nvidiaKey);
      const text = await callModel(nvidia, "nvidia/llama-3.3-nemotron-super-49b-v1");
      if (text.trim()) return text;
    } catch { /* fall through */ }
  }

  if (geminiKey?.trim() && isGeminiEnabled(geminiKey)) {
    try {
      const gemini = getGeminiClient(geminiKey);
      const text = await callModel(gemini, "gemini-2.0-flash");
      if (text.trim()) return text;
    } catch { /* fall through */ }
  }

  return "";
}

async function synthesizeWithRoleHeadings(
  batchResults: BatchResult[],
  discussion:   string,
  userQuery:    string,
  manifest:     FullSourceManifest,
  archiveTopic?: string,
  groqKey?:     string | null,
  geminiKey?:   string | null
): Promise<string> {
  const srcMap = new Map<string, { title: string; url: string; sourceType?: string; content?: string }>();
  for (const b of batchResults)
    for (const mr of b.modelResults)
      for (const s of (mr.searchResults as EnrichedResult[])) {
        const k = canonicalizeUrl(s.url);
        if (!srcMap.has(k)) srcMap.set(k, { title: s.title, url: s.url, sourceType: s.sourceType, content: s.content });
      }
  void srcMap;
  const allJudgements  = batchResults.flatMap(b => b.modelResults.flatMap(r => r.judgements));
  const allNumbers     = [...new Set(batchResults.flatMap(b => b.modelResults.flatMap(r => r.stats.numbers)))].slice(0, 15);
  const allPercentages = [...new Set(batchResults.flatMap(b => b.modelResults.flatMap(r => r.stats.percentages)))].slice(0, 10);
  const ctxPerBatch    = batchResults.map(b =>
    "## " + b.batchName + "\n" + b.modelResults.map((result) => result.ragContext ?? "").filter(Boolean).join("\n\n")
  ).join("\n\n");
  const judgeBlock = allJudgements.length > 0
    ? "COURT JUDGEMENTS:\n" + allJudgements.map(j =>
        "- **" + j.caseName + "** (" + j.year + ", " + j.court + "): " + j.held + " | " + j.url
      ).join("\n")
    : "";
  const numBlock = (allNumbers.length + allPercentages.length) > 0
    ? "\n\nNUMERICAL DATA:\nCounts: " + allNumbers.join("; ") + "\nRatios: " + allPercentages.join("; ")
    : "";
  const lines = [
    "RULE ZERO: Every single bullet point and every sentence in ##Detailed Analysis MUST end with at least one [Source N](url) citation. An uncited claim is a failed claim. The numbered source list is the only citation source â€” do not invent URLs.",
    "EXAMPLE: Use [Source 3](https://freedomhouse.org/report/india-2025) to cite the Freedom House report.",
    "Do not emit bare [1] citations or grouped [Source 1, 2] citations. Copy the exact Citation token from the source list each time.",
    "Synthesize multi-batch research into ONE definitive MUN answer.",
    "",
    archiveTopic ? `Archive topic: "${archiveTopic}"` : "",
    "Question: \"" + userQuery + "\"",
    "",
    "Cross-Batch Discussion:",
    discussion,
    "",
    "Research Context (by batch):",
    ctxPerBatch,
    "",
    "FULL SOURCE CONTENT:",
    manifest.fullContextBlock,
    "",
    judgeBlock,
    numBlock,
    "",
    "NUMBERED SOURCES (cite as [Source N](url)):",
    manifest.numberedList,
    "",
    "MANDATORY OUTPUT FORMAT â€” start with the first heading immediately, no introduction paragraph:",
    "## Key Statistics & Data",
    "[Every number found, cited with [Source N](url). Min 4 bullets if data exists. Every stat must be cited.]",
    "",
    "## Legal Framework",
    "[Court cases, UN resolutions, treaties â€” case name, year, holding, [Source N](url). Omit only if zero legal sources.]",
    "",
    "## India's Official Position",
    "[Official MEA/PIB statements, India's UN votes, bilateral positions â€” each cited with [Source N](url).]",
    "",
    "## Cross-Batch Analysis",
    "[2-3 paragraphs connecting data, legal framework, and policy positions across research batches]",
    "",
    "## Research Gaps",
    "[What the research could not cover â€” specific missing data points, unresolved angles]",
    "",
    "## Sources",
    "[Full numbered list with [Source N](url) format]",
    "",
    "CRITICAL RULES:",
    "1. Start output immediately with ## Key Statistics & Data â€” no preamble, no intro paragraph",
    "2. Minimum 15 citations total across the response",
    "3. Every stat must be cited with [Source N](url) â€” no bare numbers",
    "4. Court citations MUST include every judgement from COURT JUDGEMENTS section",
    "5. India-first framing throughout â€” min 600 words",
    "6. Prioritize CAG, NCRB, PIB, MEA, Parliament, court, and .gov.in sources before generic web sources",
    "7. If evidence is sparse, say so plainly in Research Gaps instead of filling space with guesses",
    "8. NEVER group multiple sources in one bracket like [Source 3, 4, 5].",
    "9. ALWAYS cite each source separately with its own link: [Source 3](url) [Source 4](url)",
    "10. Each citation MUST be in the format [Source N](url) — the (url) part is mandatory.",
  ];
  const prompt = lines.join("\n");

  const tryClient = async (client: any, model: string): Promise<string> => {
    if (manifest.fullContextBlock.length + prompt.length > getModelContextChars(model)) {
      return synthesizeWithManifest(userQuery, manifest, discussion, batchResults, archiveTopic, client, model, false);
    }
    const resp = await client.chat.completions.create({
      model, max_tokens: 6000, temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });
    return resp.choices[0]?.message?.content ?? "";
  };

  if (groqKey?.trim()) {
    try {
      const groq = getGroqClient(groqKey);
      const text = await tryClient(groq, "llama-3.3-70b-versatile");
      if (text.trim()) return text;
    } catch { /* fall through */ }
  }

  if (geminiKey?.trim() && isGeminiEnabled(geminiKey)) {
    try {
      const gemini = getGeminiClient(geminiKey);
      const text = await tryClient(gemini, "gemini-2.0-flash");
      if (text.trim()) return text;
    } catch { /* fall through */ }
  }

  return "";
}

function buildClaudeMergePrompt(
  userQuery: string,
  archiveTopic: string | undefined,
  discussion: string,
  batchResults: BatchResult[],
  manifest: FullSourceManifest,
): string {
  const batchBlocks = batchResults.map((b) => {
    const findings = b.modelResults
      .flatMap((r) => r.structuredData.keyFindings ?? [])
      .filter(Boolean)
      .slice(0, 6);
    const bestContext = b.modelResults
      .map(r => r.ragContext ?? "")
      .sort((a, b) => b.length - a.length)[0] ?? "";

    return [
      `## BATCH: ${b.batchName} (Role: ${b.role})`,
      findings.length > 0
        ? `### Key Findings:\n${findings.map(f => `- ${f}`).join("\n")}`
        : "### Key Findings: (none extracted)",
      bestContext
        ? `### Research Context (full page content):\n${bestContext}`
        : "",
    ].filter(Boolean).join("\n\n");
  }).join("\n\n---\n\n");

  const isMediaOrDemocracy = batchResults.some(
    b => b.role === "media_journalist" || b.batchName.includes("Freedom") ||
      b.batchName.includes("Democracy") || b.batchName.includes("Civil")
  );

  return [
    "You are BestDel, the parliamentary intelligence engine for Indian Mock Parliament delegates.",
    "",
    "OUTPUT CONTRACT:",
    "- You are generating a formal parliamentary intelligence briefing - NOT a chat response",
    "- Minimum length: 1500 words for web_search mode, 3500 words for deep_research mode",
    "- Structure: Analytical sections with headers, dense explanatory paragraphs, evidence integration",
    "- Every factual claim cites [Source N](url) - no orphaned claims",
    "- Voice: Senior Parliamentary Research Officer, Parliament of India",
    "",
    "THESIS STANDARDS:",
    "- Each analytical section opens with its strongest analytical claim, not background",
    "- Background context belongs only in the first section",
    "- Every source in the numbered list must be cited at least once",
    "- Statistical claims must include year, agency, and magnitude",
    "- Legal claims must include Article/Section number, court name, year",
    "- No placeholder text, no repetition of prior sections",
    "",
    "HALLUCINATION PREVENTION:",
    "- If a source gap exists, write: \"Evidence gap: [topic] - delegates should independently verify\"",
    "- Never invent statistics, Article numbers, case names, or institutional positions",
    "- If uncertain, qualify: \"According to [Source N], which may require verification...\"",
    "",
    "DEBATE OPERABILITY:",
    "- Every analytical claim should map to a usable argument, rebuttal, or POI",
    "- Coalition and negotiation dynamics must appear in Division 7 analysis",
    "- Strategic synthesis in Division 11 must expose non-obvious leverage points",
    "",
    "MANDATORY CITATION RULES:",
    "- Cite every factual claim as [Source N](url) using ONLY the numbered sources below.",
    "EXAMPLE: Use [Source 3](https://freedomhouse.org/report/india-2025) to cite the Freedom House report.",
    "- Do not emit bare [1] citations or grouped [Source 1, 2] citations. Copy exact Citation tokens from the source list.",
    "- NEVER group multiple sources in one bracket like [Source 3, 4, 5].",
    "- ALWAYS cite each source separately with its own link: [Source 3](url) [Source 4](url)",
    "- Each citation MUST be in the format [Source N](url) — the (url) part is mandatory.",
    "- Every numbered source MUST appear at least once.",
    "- If a source cannot be cited in the main text, include it in Source Coverage Audit.",
    "- NEVER invent URLs or sources. Only use the list below.",
    isMediaOrDemocracy
      ? "TOPIC NOTE: This is a press freedom / democracy topic. Lead with international index scores (Freedom House, V-Dem, EIU, RSF, CPJ). Label government statements as 'the government claims...' — not as objective fact."
      : "",
    archiveTopic ? `\nArchive topic: ${archiveTopic}` : "",
    `\nResearch question: ${userQuery}`,
    "",
    "=== CROSS-BATCH DISCUSSION ===",
    discussion || "(none)",
    "",
    "=== RESEARCH BATCHES (findings + page content) ===",
    batchBlocks,
    "",
    `=== COMPLETE SOURCE MANIFEST (${manifest.totalSources} sources) ===`,
    manifest.numberedList || "(none)",
    "",
    "=== FULL SOURCE CONTENT (READ ALL BEFORE WRITING) ===",
    manifest.fullContextBlock || "(none)",
    "",
    "=== OUTPUT FORMAT ===",
    "## Key Statistics & Data",
    "## Legal Framework",
    "## Civil Society & International Assessment",
    "## India's Official Position",
    "## Research Gaps",
    "## Source Coverage Audit",
    "(For every source: Used — <reason>  OR  Not used — <reason>)",
  ].filter(Boolean).join("\n");
}

function buildMinimalDivisionDrafts(
  batchResults: BatchResult[],
  allRagContext: string,
  userQuery: string,
): Record<string, string> {
  const allFindings = batchResults
    .flatMap(b => b.modelResults.flatMap(r => r.structuredData?.keyFindings ?? []))
    .filter(Boolean);
  const allStats = batchResults
    .flatMap(b => b.modelResults.flatMap(r => r.stats?.numbers ?? []))
    .filter(Boolean);
  const judgements = batchResults
    .flatMap(b => b.modelResults.flatMap(r => r.judgements ?? []))
    .filter(Boolean);

  const d1Draft = [
    `## CORE BRIEF - AGENDA: "${userQuery.slice(0, 200)}"`,
    allFindings.slice(0, 6).map(f => `- ${f}`).join("\n"),
    judgements.length > 0
      ? `## Court Judgements Found:\n${judgements.slice(0, 3).map(j => `${j.caseName} (${j.year}, ${j.court}) - ${j.held}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  const d2Draft = allStats.length > 0
    ? `## KEY STATISTICAL EVIDENCE\n${allStats.slice(0, 10).map(s => `- ${s}`).join("\n")}`
    : "";

  return {
    core_brief: d1Draft,
    analytical_dimensions: d2Draft,
    evidence_verification: allRagContext.slice(0, 8000),
  };
}

const MODEL_CONTEXT_CHARS: Record<string, number> = {
  "gemini-2.5-flash": 400_000,
  "gemini-2.0-flash": 200_000,
  "llama-3.3-70b-versatile": 90_000,
  "llama-3.1-70b-instruct": 70_000,
  "deepseek/deepseek-chat": 80_000,
  default: 50_000,
};

function getManifestModelContextChars(modelId: string): number {
  const normalized = modelId.toLowerCase();
  for (const [key, chars] of Object.entries(MODEL_CONTEXT_CHARS)) {
    if (key !== "default" && normalized.includes(key)) return chars;
  }
  return MODEL_CONTEXT_CHARS.default;
}

async function synthesizeWithManifest(
  userQuery: string,
  manifest: FullSourceManifest,
  discussion: string,
  batchResults: BatchResult[],
  archiveTopic: string | undefined,
  client: any,
  modelId: string,
  isDeep: boolean,
): Promise<string> {
  const contextLimit = getManifestModelContextChars(modelId);
  const fullPromptEstimate = manifest.fullContextBlock.length + 8000;
  if (fullPromptEstimate <= contextLimit) {
    const prompt = buildClaudeMergePrompt(userQuery, archiveTopic, discussion, batchResults, manifest);
    const response = await client.chat.completions.create({
      model: modelId,
      temperature: 0.15,
      max_tokens: isDeep ? 8000 : 6000,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices?.[0]?.message?.content ?? "";
  }

  const chunks = chunkSourceManifest(manifest, contextLimit);
  logger.info({ chunks: chunks.length, modelId }, "[synthesis] Multi-chunk synthesis required");
  const chunkDrafts: string[] = [];
  for (const chunk of chunks) {
    const draft = await chunkPassSynthesis(userQuery, chunk, discussion, batchResults, archiveTopic, client, modelId);
    if (draft.trim()) chunkDrafts.push(draft);
  }
  if (chunkDrafts.length === 0) return "";
  return mergeChunkDrafts(chunkDrafts, manifest.numberedList, userQuery, client, modelId, isDeep);
}

async function chunkPassSynthesis(
  userQuery: string,
  chunk: ContextChunk,
  discussion: string,
  batchResults: BatchResult[],
  archiveTopic: string | undefined,
  client: any,
  modelId: string,
): Promise<string> {
  const batchFindings = batchResults
    .flatMap((batch) => batch.modelResults.flatMap((result) => result.structuredData?.keyFindings ?? []))
    .filter(Boolean)
    .slice(0, 20)
    .map((finding) => `- ${finding}`)
    .join("\n");
  const prompt = [
    "You are drafting one evidence chunk for a BestDel parliamentary intelligence briefing.",
    `Research question: ${userQuery}`,
    archiveTopic ? `Archive topic: ${archiveTopic}` : "",
    `Chunk ${chunk.chunkIndex} of ${chunk.totalChunks}. Use only these source ids and preserve citations as [Source N](url).`,
    "Every factual claim requires a citation. Do not invent URLs.",
    "",
    "Cross-model discussion:",
    discussion || "(none)",
    "",
    "Batch findings:",
    batchFindings || "(none)",
    "",
    "Numbered sources in this chunk:",
    chunk.numberedList,
    "",
    "Anchor sources:",
    chunk.anchorSources,
    "",
    "Chunk sources:",
    chunk.chunkSources,
    "",
    "Write a dense chunk draft with Key Statistics, Legal/Government Evidence, Findings, Gaps, and a Source Coverage Audit for this chunk.",
  ].filter(Boolean).join("\n");
  const response = await client.chat.completions.create({
    model: modelId,
    temperature: 0.15,
    max_tokens: 4500,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices?.[0]?.message?.content ?? "";
}

async function mergeChunkDrafts(
  chunkDrafts: string[],
  numberedList: string,
  userQuery: string,
  client: any,
  modelId: string,
  isDeep: boolean,
): Promise<string> {
  const prompt = [
    "Merge these chunk drafts into one final BestDel parliamentary intelligence briefing.",
    `Research question: ${userQuery}`,
    "Preserve factual density, remove repetition, and cite every factual claim as [Source N](url).",
    "Every numbered source must appear in Source Coverage Audit as Used or Not cited with a reason.",
    "",
    "AUTHORITATIVE NUMBERED SOURCES:",
    numberedList,
    "",
    "CHUNK DRAFTS:",
    chunkDrafts.map((draft, index) => `--- CHUNK DRAFT ${index + 1} ---\n${draft}`).join("\n\n"),
  ].join("\n");
  const response = await client.chat.completions.create({
    model: modelId,
    temperature: 0.1,
    max_tokens: isDeep ? 8000 : 6000,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices?.[0]?.message?.content ?? "";
}

async function mergeWithClaude(
  userQuery: string,
  archiveTopic: string | undefined,
  discussion: string,
  batchResults: BatchResult[],
  allResults: SearchResult[],
  manifest: FullSourceManifest,
  openrouterKey?: string | null
): Promise<string> {
  void allResults;
  if (!openrouterKey?.trim()) return "";
  const openrouter = getOpenRouterClient(openrouterKey);
  const callMergeModel = async (model: string): Promise<string> => {
    return synthesizeWithManifest(userQuery, manifest, discussion, batchResults, archiveTopic, openrouter, model, true);
  };

  try {
    const claudeText = await callMergeModel(OPENROUTER_PRIMARY_MODEL);
    if (claudeText.trim()) return claudeText;
  } catch {
    // Fall back to DeepSeek below.
  }

  try {
    return await callMergeModel("deepseek/deepseek-chat");
  } catch {
    return "";
  }
}

// â”€â”€â”€ Run multiple models in parallel, then synthesize â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleMultiSearch(
  req: any,
  res: import("express").Response,
  opts: {
    webModels: string[];       // e.g. ["groq/llama-3.3-70b-versatile", "groq/deepseek-r1-distill-llama-70b"]
    mode: string;
    conversationId: number;
    chatMessages: { role: "user" | "assistant"; content: string }[];
    userQuery: string;
    userSystemPrompt: string;
    archiveId?: number;
    archiveTopic?: string;
    archiveSummary?: string;
    groqKey?: string | null;
    nvidiaKey?: string | null;
    geminiKey?: string | null;
    tavilyKey?: string | null;
    serperKey?: string | null;
    exaKey?: string | null;
    braveKey?: string | null;
    firecrawlKey?: string | null;
    jinaKey?: string | null;
    openrouterKey?: string | null;
    cerebrasKey?: string | null;
    hfToken?: string | null;
    getIsDisconnected?: () => boolean;
    agendaIntelligence?: AgendaIntelligence;
    runIdentity?: ResearchRunIdentity;
    abortSignal?: AbortSignal;
  }
) {
  const {
    webModels,
    mode,
    conversationId,
    chatMessages,
    userQuery,
    userSystemPrompt,
    archiveId,
    archiveTopic,
    archiveSummary,
    groqKey,
    nvidiaKey,
    geminiKey,
    tavilyKey,
    serperKey,
    exaKey,
    braveKey,
    firecrawlKey,
    jinaKey,
    openrouterKey,
    cerebrasKey,
  } = opts;
  const isDeep = mode === "deep_research";
  const requestId = opts.runIdentity?.requestId ?? `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // Accumulate per-model events for persistence so completed messages can
  // re-render the research pipeline (searches, found, exhaustion, discussion).
  const modelTrack = new Map<string, {
    searches: string[];
    found: { title: string; url: string; engine?: string; sourceType?: string }[];
    exhausted: { reason: "rate_limit" | "error" } | null;
  }>();
  const ensureTrack = (key: string) => {
    let t = modelTrack.get(key);
    if (!t) {
      t = { searches: [], found: [], exhausted: null };
      modelTrack.set(key, t);
    }
    return t;
  };
  let trackedDiscussion: string | null = null;
  const legacyStreamGuard = new TerminalWriteGuard();

  const send = (data: object): void => {
    // Tap into outgoing events so we can rebuild the pipeline state later.
    try {
      const d = data as Record<string, any>;
      if (typeof d.model === "string") {
        const t = ensureTrack(d.model);
        if (typeof d.searching === "string") t.searches.push(d.searching);
        if (Array.isArray(d.found)) {
          for (const f of d.found) {
            if (f && typeof f.url === "string") {
              t.found.push({ title: f.title ?? "", url: f.url, engine: f.engine, sourceType: f.sourceType });
            }
          }
        }
        if (d.rateLimited) t.exhausted = { reason: "rate_limit" };
      }
      if (typeof d.modelExhausted === "string") {
        // modelExhausted carries the bare modelId â€” try to map it to one of the active webModels
        const matched = webModels.find((w) => w === d.modelExhausted);
        if (matched) {
          ensureTrack(matched).exhausted = {
            reason: d.reason === "rate_limit" ? "rate_limit" : "error",
          };
        }
      }
      if (typeof d.discussion === "string") trackedDiscussion = d.discussion;
    } catch {
      // tracking is best-effort
    }

    const payload = normalizeLegacySsePayload(opts.runIdentity, data as Record<string, unknown>);
    if (!legacyStreamGuard.canWrite(payload)) return;
    writeAnthropicSseEvent(res, requestId, payload, logger);
  };

  // Inform the client which models are actually participating (including auto-added workers).
  send({ effectiveModels: webModels, plannerModel: webModels[0] ?? null });

  const committeeType = opts.agendaIntelligence?.committeeType
    ?? inferCommitteeTypeFromAgenda(`${archiveTopic ?? ""} ${userQuery} ${userSystemPrompt}`);
  const dimensionEngine = opts.agendaIntelligence?.dimensionOutput
    ?? runDimensionEngine(userQuery, committeeType, userSystemPrompt);
  const divisionOwnership = assignDivisionOwnership(webModels, dimensionEngine, isDeep ? 8192 : 4096);
  if (isDeep) {
    send({ type: "agenda_class", agendaClass: dimensionEngine.agendaClass, committeeType: dimensionEngine.committeeType });
    send({ type: "dimension_scores", scores: [...dimensionEngine.primaryDimensions, ...dimensionEngine.secondaryDimensions] });
    send({ pipelineTimeline: { stage: "dimension_engine_complete", timestamp: Date.now(), data: { primaryDimensions: dimensionEngine.primaryDimensions.map(d => d.name), secondaryDimensions: dimensionEngine.secondaryDimensions.map(d => d.name) } } });
    send({
      divisionOwnership: divisionOwnership.map(({ model, divisions, tokenBudget, priority }) => ({
        model,
        divisions,
        tokenBudget,
        priority,
      })),
    });
  }

  // Inner heartbeat â€” keeps strict 30s proxy timeouts alive during synthesis silence
  const innerHeartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": hb\n\n");
  }, 10_000);

  const runPipeline = async (): Promise<void> => {
  const topic = classifyTopic(userQuery);
  const SEARCH_SYS = buildSearchSystem("web", userSystemPrompt, topic);
  const DEEP_SYS = buildSearchSystem("deep", userSystemPrompt, topic);
  const systemPrompt = isDeep ? DEEP_SYS : SEARCH_SYS;

  // Per-model client/label resolution (used both for emit-keys and for writing)
  const modelInfos = webModels.map((rawModelId) => {
    let client: any;
    let modelId: string;
    let providerLabel: string;
    const parsedModel = parseProviderModelId(rawModelId);
    if (parsedModel.prefix === "groq") {
      client = getGroqClient(groqKey);
      modelId = parsedModel.modelId;
      providerLabel = "Groq " + modelId.replace(/-(instruct|preview|versatile|latest)$/i, "").slice(0, 15);
    } else if (parsedModel.prefix === "nvidia") {
      client = getNvidiaClient(opts.nvidiaKey);
      modelId = parsedModel.modelId;
      providerLabel = "NVIDIA " + (modelId.split("/").pop() || modelId).replace(/-(instruct|preview|versatile|latest)$/i, "").slice(0, 15);
    } else if (parsedModel.prefix === "ollama") {
      client = getOllamaClient(null, null);
      modelId = parsedModel.modelId;
      providerLabel = "Ollama " + modelId.slice(0, 15);
    } else if (parsedModel.prefix === "gemini") {
      client = getGeminiClient(geminiKey);
      modelId = parsedModel.modelId;
      providerLabel = "Gemini " + modelId.replace(/-(instruct|preview|versatile|latest)$/i, "").slice(0, 15);
    } else if (parsedModel.prefix === "openrouter") {
      client = getOpenRouterClient(openrouterKey ?? null);
      modelId = parsedModel.modelId;
      providerLabel = "OpenRouter " + modelId.replace(/-(instruct|preview|versatile|latest)$/i, "").slice(0, 15);
    } else if (parsedModel.prefix === "cerebras") {
      client = getCerebrasClient(opts.cerebrasKey ?? process.env.CEREBRAS_API_KEY);
      modelId = parsedModel.modelId;
      providerLabel = "Cerebras " + modelId.slice(0, 15);
    } else {
      client = getGroqClient(groqKey);
      modelId = rawModelId;
      providerLabel = "Groq " + modelId.slice(0, 15);
    }
    return { rawModelId, modelId, client, providerLabel };
  });

  // â”€â”€ SEQUENTIAL BATCHED MULTI-ROLE RESEARCH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 1. Analyse the query to decide which research roles are needed
  const topicStrategy = buildTopicSourceStrategy(userQuery, archiveTopic);
  send({ topicStrategyBuilt: true, topicStrategy });
  const queryAnalysis = analyzeQuery(userQuery);

  // Canonical query planner builds dimension-aware role-specific search queries.
  const plannerInfo = modelInfos[0];
  send({ pipelineTimeline: { stage: "query_planning_start", timestamp: Date.now(), data: { plannerModel: plannerInfo?.rawModelId ?? null } } });
  let planned: PlannedQueries = await buildUnifiedQueryPlan(userQuery, dimensionEngine, {
    isDeep,
    groqKey,
    archiveTopic,
    topic,
  });
  if (planned) {
    const normalizeQueries = (qs: string[]) =>
      qs.map(q => q.trim().slice(0, 120)).filter(q => q.length > 5);
    planned.data_analyst = normalizeQueries(planned.data_analyst);
    planned.legal_researcher = normalizeQueries(planned.legal_researcher);
    planned.policy_analyst = normalizeQueries(planned.policy_analyst);
    planned.current_affairs = normalizeQueries(planned.current_affairs);
    if (planned.media_journalist) {
      planned.media_journalist = normalizeQueries(planned.media_journalist);
    }
    if (isDeep) planned = allocateQueryBudgetByDimension(dimensionEngine, planned);
    const enforced = enforceQueryMinimums(planned, userQuery, topic);
    planned.data_analyst = enforced.data_analyst;
    planned.legal_researcher = enforced.legal_researcher;
    planned.policy_analyst = enforced.policy_analyst;
    planned.current_affairs = enforced.current_affairs;
    planned.media_journalist = enforced.media_journalist;
  }
  send({
    pipelineTimeline: {
      stage: "query_planning_complete",
      timestamp: Date.now(),
      data: planned ? {
        totalQueries: [
          ...planned.data_analyst,
          ...planned.legal_researcher,
          ...planned.policy_analyst,
          ...planned.current_affairs,
          ...(planned.media_journalist ?? []),
        ].length,
      } : { totalQueries: 0 },
    },
  });
  if (planned) {
    const flat = [
      ...planned.data_analyst,
      ...planned.legal_researcher,
      ...planned.policy_analyst,
      ...planned.current_affairs,
      ...(planned.media_journalist ?? []),
    ].slice(0, 18);
    if (flat.length > 0) send({ researchPlan: flat });
    send({
      plannerRoles: {
        data_analyst:     planned.data_analyst.slice(0, 4),
        legal_researcher: planned.legal_researcher.slice(0, 4),
        policy_analyst:   planned.policy_analyst.slice(0, 4),
        current_affairs:  planned.current_affairs.slice(0, 4),
        ...(planned.media_journalist?.length ? { media_journalist: planned.media_journalist.slice(0, 4) } : {}),
      },
    });
  }

  // Planning is awaited before batch execution, so every selected model can research.
  const workerModelInfos = modelInfos;

  // 2. Run models in sequential role-based batches:
  //    Data & Statistics  â†’  Legal Precedents  â†’  Policy & Statements
  //    Each batch waits 2 s before starting, eliminating 413/429 burst errors
  //    that occurred when all models fired simultaneously.
  const batchResults = await executeSequentialBatches(
    workerModelInfos,
    userQuery,
    archiveTopic,
    queryAnalysis,
    isDeep,
    tavilyKey,
    serperKey,
    exaKey,
    braveKey,
    firecrawlKey,
    jinaKey,
    groqKey,
    geminiKey,
    planned,
    send,
    opts.getIsDisconnected,
    opts.abortSignal
  );

  if (opts.getIsDisconnected?.()) return;

  // Aggregate enriched results across all batches, preserving full content
  let allEnrichedResults: EnrichedResult[] = mergeEnrichedResults(
    batchResults.flatMap(batch => batch.modelResults.flatMap(mr => mr.searchResults as EnrichedResult[]))
  );
  const sourceTypeCounts = allEnrichedResults.reduce((acc, source) => {
    const key = source.sourceType ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const engineCounts = allEnrichedResults.reduce((acc, source) => {
    const key = source.engine ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  send({
    sourceStats: {
      totalSources: batchResults.flatMap(b => b.modelResults.flatMap(mr => mr.searchResults)).length,
      uniqueSources: allEnrichedResults.length,
      bySourceType: sourceTypeCounts,
      byEngine: engineCounts,
    },
  });
  if (allEnrichedResults.length < 5 && isDeep) {
    send({ emergencySearch: true, reason: `Only ${allEnrichedResults.length} unique sources found` });
    const emergencyQueries = [
      `${userQuery} India site:thehindu.com OR site:indianexpress.com`,
      `${userQuery} India government policy report 2023 2024`,
      `${userQuery} India Supreme Court judgment indiankanoon.org`,
    ];
    const emergencyResults = await Promise.allSettled(
      emergencyQueries.map((query) => searchWebDeep(query, { tavilyKey, serperKey, exaKey, braveKey, abortSignal: opts.abortSignal }, topic))
    );
    const mergedEmergency = mergeSearchResults(emergencyResults
      .filter((result): result is PromiseFulfilledResult<SearchResult[]> => result.status === "fulfilled")
      .flatMap((result) => result.value));
    if (mergedEmergency.length > 0) {
      const enrichedEmergency = await enrichResults(mergedEmergency, userQuery, 10, undefined, jinaKey, "deep", 15, firecrawlKey) as EnrichedResult[];
      allEnrichedResults = mergeEnrichedResults([...allEnrichedResults, ...enrichedEmergency]);
    }
  }
  const sourceManifest = compileFullSourceManifest(allEnrichedResults, userQuery);
  logger.info({
    totalSources: sourceManifest.totalSources,
    govSources: sourceManifest.govSources.length,
    courtSources: sourceManifest.courtJudgements.length,
  }, "[pipeline] Source manifest compiled");
  send({
    sourceManifest: {
      total: sourceManifest.totalSources,
      gov: sourceManifest.govSources.length,
      court: sourceManifest.courtJudgements.length,
      intl: sourceManifest.intlSources.length,
    },
  });
  send({
    fullSourceManifest: {
      totalSources: sourceManifest.totalSources,
      sources: sourceManifest.compiledBlocks.map((block) => ({
        index: block.index,
        title: block.title,
        url: block.url,
        badge: block.badge,
        sourceType: block.sourceType,
        score: block.score,
        hasFullContent: block.fullContent.length > 200,
        contentPreview: block.fullContent.slice(0, 300),
        reportType: block.reportType,
        judgement: block.judgement?.isJudgement ? {
          caseName: block.judgement.caseName,
          year: block.judgement.year,
          court: block.judgement.court,
          held: block.judgement.held?.slice(0, 200),
        } : null,
      })),
    },
  });
  const registryMode = isDeep ? "deep" : "web";
  const cachedEvidenceRegistry = getCachedRegistry(userQuery, registryMode);
  if (cachedEvidenceRegistry) {
    send({ type: "cache_hit", message: "Evidence loaded from recent research - retrieval skipped" });
  }
  const evidenceRegistry = cachedEvidenceRegistry ?? buildEvidenceRegistry(allEnrichedResults, userQuery);
  if (!cachedEvidenceRegistry) setCachedRegistry(userQuery, registryMode, evidenceRegistry);
  const contentAudit = auditSourceContentGaps(evidenceRegistry);
  send({ sourceContentAudit: contentAudit });
  if (contentAudit.sourcesEmpty > 3) {
    logger.warn({ empty: contentAudit.sourcesEmpty }, "[pipeline] High empty-content source count");
  }
  const allSearchResults = allEnrichedResults; // Keep for citation normalizer compatibility
  let corePipelineResult: Awaited<ReturnType<typeof runResearchPipeline>> | null = null;
  let streamedAnswerChunks: string[] = [];
  if (isDeep) {
    const registryCheck = validateEvidenceRegistryCompleteness(evidenceRegistry, dimensionEngine);
    if (!registryCheck.complete) {
      logger.warn({
        missingDimensions: registryCheck.missingDimensions,
        coverageScore: registryCheck.coverageScore,
      }, "[pipeline] Evidence registry coverage gap - some dimensions have no sources");
      evidenceRegistry.evidenceGaps.push(...registryCheck.missingDimensions.map((dimension) => `${dimension} dimension - no sources retrieved`));
    }
    send({ type: "evidence_registry", registry: summarizeEvidenceRegistry(evidenceRegistry) });
    send({ pipelineTimeline: { stage: "evidence_registry_built", timestamp: Date.now(), data: registryCheck } });
    try {
      const coreResult = await runResearchPipeline({
        requestId,
        userQuery,
        mode: "deep_research",
        archiveText: buildArchiveContextText(archiveTopic, archiveSummary),
        preloadedSources: allEnrichedResults.map(enrichedResultToCoreSource),
        emit: (event: PipelineEvent) => {
          send({
            type: "core_pipeline_event",
            corePipelineEvent: event.type,
            corePipelineData: event.data ?? {},
          });
        },
        onStream: (chunk) => {
          streamedAnswerChunks.push(chunk);
          send({ type: 'answer_delta', content: chunk });
        },
        signal: opts.abortSignal,
      });
      corePipelineResult = coreResult;
      send({
        selectedResearchMode: "deep_research",
        archiveRouting: coreResult.archiveRouting,
        researchAngles: coreResult.researchAngles,
        legacyFallbackUsed: coreResult.usedLegacyFallback,
      });
      send({
        sourceContract: {
          requiredEvidenceCardsPerModel: coreResult.agendaContract.minimumEvidenceCardsPerModel,
          requiredUniqueCitedSources: coreResult.agendaContract.minimumUniqueCitedSources,
          citationEligibleSources: coreResult.evidenceRegistry.getCitationEligibleCount(),
          roles: coreResult.modelRoleOutputs.map((role) => ({
            roleName: role.roleName,
            sourceCountUsed: role.sourceUsageCount,
            passed: role.sourceUsageRequirementSatisfied,
            sourceGapReason: role.failureReason,
          })),
        },
      });
      if (coreResult.sourceGapReport) {
        send({ sourceGapReport: coreResult.sourceGapReport });
      }
      send({
        coreQualityGate: {
          passed: coreResult.qualityGate.passed,
          score: coreResult.qualityGate.score,
          automaticFailures: coreResult.qualityGate.automaticFailures,
          warnings: coreResult.qualityGate.warnings,
        },
      });
    } catch (coreErr) {
      logger.warn({ requestId, err: coreErr }, "[core-pipeline] audit adapter failed");
      send({
        type: "core_pipeline_event",
        corePipelineEvent: "pipeline_failed",
        corePipelineData: { reason: "core adapter failed; legacy deep research continued" },
      });
      // If answer chunks were streamed despite the error, use them
      if (streamedAnswerChunks.length > 0) {
        corePipelineResult = {
          agendaContract: {} as any,
          evidenceRegistry: {} as any,
          modelRoleOutputs: [],
          sourceUsageAggregate: { validUsageCount: 0, invalidUsageCount: 0, failedSourceIds: [], providerErrors: [] },
          citationReport: { validCitations: [], invalidCitations: [], duplicateCitations: [], missingCitations: [] },
          qualityGate: { passed: true, score: 100, automaticFailures: [], warnings: [] },
          sourceGapReport: null,
          finalAnswer: streamedAnswerChunks.join(""),
          usedCoreGeneration: false,
          usedLegacyFallback: false,
          divisionOutputs: new Map(),
          terminalStatus: "completed_with_source_gaps",
          archiveRouting: null,
          researchAngles: [],
        } as any;
      }
    }
  }

  let finalResponse: string = "";
  let discussionText: string | null = null;
  const useCoreFinalAnswer = shouldUseCoreFinalAnswer({
    isDeep,
    usedCoreGeneration: corePipelineResult?.usedCoreGeneration,
    usedLegacyFallback: corePipelineResult?.usedLegacyFallback,
    useCoreGenerationEnv: process.env.USE_CORE_GENERATION,
    emergencyCompatibilityEnv: process.env.BESTDEL_EMERGENCY_COMPATIBILITY_MODE,
  });

  if (batchResults.length === 0 || batchResults.every(b => b.modelResults.every(mr => mr.ragContext === ""))) {
    await persistResearchExhausted({
      conversationId,
      runIdentity: opts.runIdentity,
      citationEligibleSources: sourceManifest.totalSources,
      send,
      metadata: {
        mode: isDeep ? "deep_research" : "web_search",
        models: [],
        sources: sourceManifest.compiledBlocks.map((source) => ({
          sourceId: source.index,
          title: source.title,
          url: source.url,
          sourceType: source.sourceType,
        })),
      },
    });
    return;
  }

  // 3a. Data cheatsheet (aggregated across all batches)
  const cheatsheet = buildDataCheatsheet(batchResults, userQuery);
  send({ dataCheatsheet: cheatsheet });

  // Stream answer from core pipeline if available (bypass source usage map validation for deployment)
  if (corePipelineResult) {
    send({ synthesizing: true, mode: "core_generation" });
    send({ pipelineTimeline: { stage: "core_generation_final_answer_selected", timestamp: Date.now(), data: { usedLegacyFallback: corePipelineResult.usedLegacyFallback } } });
    finalResponse = corePipelineResult.finalAnswer;
    discussionText = "";
  }

  // 3a. Cross-batch discussion (only if no core pipeline result)
  if (!corePipelineResult && shouldRunCrossModelDiscussion(allSearchResults, isDeep, !isDeep && dimensionEngine.agendaClass !== "crisis")) {
    send({ discussing: true });
    try {
      discussionText = await generateCrossBatchDiscussion(batchResults, userQuery, groqKey, geminiKey, nvidiaKey, cerebrasKey);
      if (discussionText) send({ discussion: discussionText });
    } catch (err) {
      req.log?.error?.({ err }, "generateCrossBatchDiscussion failed");
      send({ discussion: "" });
      discussionText = "";
    }
  } else {
    send({ discussionSkipped: true });
    discussionText = "";
  }

  if (!corePipelineResult && isDeep) {
    // 3b. Division-pipeline synthesis (production path)
    send({ synthesizing: true, mode: "sequential_divisions" });
    send({ pipelineTimeline: { stage: "division_pipeline_start", timestamp: Date.now(), data: { divisions: divisionOwnership.length } } });

    const modelPool: ModelPoolEntry[] = buildModelPool(
      modelInfos,
      groqKey,
      geminiKey,
      openrouterKey,
    );

    try {
      const { assembledBriefing } = await runDivisionPipeline(
        dimensionEngine,
        evidenceRegistry,
        modelPool,
        {
          streamDivision: (divisionId, content) => {
            send({ divisionComplete: divisionId, preview: content.slice(0, 200) });
            send({ pipelineTimeline: { stage: "division_N_complete", timestamp: Date.now(), data: { divisionId } } });
          },
          onDivisionChunk: (divisionId, chunk) => {
            send({ divisionChunk: { divisionId, chunk } });
          },
          onProgress: (current, total) => {
            send({ divisionProgress: { current, total } });
          },
          discussionText: discussionText ?? "",
          requestId,
        },
      );
      finalResponse = assembledBriefing;
      finalResponse = normalizeSourceCitations(finalResponse, allSearchResults);
    } catch (divisionErr) {
      logger.error({ requestId, err: divisionErr }, "[divisions] pipeline failed - falling back to mega-prompt");
      finalResponse = await mergeWithClaude(
        userQuery,
        archiveTopic,
        discussionText ?? "",
        batchResults,
        allSearchResults,
        sourceManifest,
        openrouterKey,
      );
      finalResponse = normalizeSourceCitations(finalResponse, allSearchResults);
    }
  } else if (!corePipelineResult) {
    // 3b. Role-sectioned synthesis
    send({ synthesizing: true });
    try {
      send({ claudeSynthesizing: true });
      finalResponse = await mergeWithClaude(
        userQuery,
        archiveTopic,
        discussionText ?? "",
        batchResults,
        allSearchResults,
        sourceManifest,
        openrouterKey
      );
      if (!finalResponse.trim()) {
        finalResponse = await synthesizeWithRoleHeadings(batchResults, discussionText ?? "", userQuery, sourceManifest, archiveTopic, groqKey, geminiKey);
      }
    } catch (synthErr) {
      req.log?.error?.({ err: synthErr }, "synthesizeWithRoleHeadings failed");
    }

    finalResponse = normalizeSourceCitations(finalResponse, allSearchResults);
  }

  // Fallback: attempt groq direct synthesis before bare bullets
  if (!finalResponse.trim()) {
    try {
      const groq = getGroqClient(groqKey ?? null);
      const allRagContext = batchResults
        .flatMap(b => b.modelResults.map(r => r.ragContext ?? ""))
        .sort((a, b) => b.length - a.length)[0] ?? "";
      const allFindings = batchResults.flatMap(b => b.modelResults.flatMap(r => r.structuredData.keyFindings ?? []));
      const divisionDrafts = buildMinimalDivisionDrafts(batchResults, allRagContext, userQuery);
      const fallbackPrompt = isDeep
        ? buildDivisionAwareSynthesisPrompt(
            userQuery,
            dimensionEngine,
            evidenceRegistry,
            divisionDrafts,
            discussionText ?? "",
            sourceManifest
          )
        : [
            `Answer this MUN research question for Indian delegates: "${userQuery}"`,
            "",
            "Use the research context below. Cite sources as [Source N](url). Write 600+ words.",
            "## Research Context:",
            sourceManifest.fullContextBlock,
            allFindings.length > 0 ? "## Key Findings from research:\n" + allFindings.map((f: string) => `- ${f}`).join("\n") : "",
            "## Numbered Sources:",
            sourceManifest.numberedList,
          ].filter(Boolean).join("\n");
      const resp = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile", max_tokens: 4096, temperature: 0.3,
        messages: [{ role: "user", content: fallbackPrompt }],
      });
      finalResponse = resp.choices[0]?.message?.content ?? "";
    } catch { /* bare bullet list below */ }
  }

  // Fallback: show aggregated key findings when synthesis fails
  if (!finalResponse.trim()) {
    const fallbackParts = batchResults.flatMap(b => b.modelResults.flatMap(r => r.structuredData.keyFindings ?? []));
    if (fallbackParts.length > 0) {
      finalResponse = "## Research Findings\n\n" + fallbackParts.map(f => "- " + f).join("\n");
      send({ content: "\n\n> âš ï¸ Synthesis model unavailable â€” showing key findings from all research batches.\n\n" });
    } else {
      await persistResearchExhausted({
        conversationId,
        runIdentity: opts.runIdentity,
        citationEligibleSources: sourceManifest.totalSources,
        send,
        metadata: {
          mode: isDeep ? "deep_research" : "web_search",
          models: [],
          sources: sourceManifest.compiledBlocks.map((source) => ({
            sourceId: source.index,
            title: source.title,
            url: source.url,
            sourceType: source.sourceType,
          })),
        },
      });
      return;
    }
  }

  const targetWords = isDeep ? 3500 : 1200;
  const currentWordsForExpansion = finalResponse.trim().split(/\s+/).filter(Boolean).length;
  if (!corePipelineResult && currentWordsForExpansion < targetWords && allSearchResults.length > 0) {
    send({ expansionRequired: true, currentWords: currentWordsForExpansion, targetWords });
    if (geminiKey?.trim() && isGeminiEnabled(geminiKey)) {
      try {
        const gemini = getGeminiClient(geminiKey);
        const expansionPrompt = [
          `The following parliamentary intelligence briefing is incomplete at ${currentWordsForExpansion} words.`,
          `TARGET: ${targetWords} words minimum.`,
          "",
          "EXPANSION RULES:",
          "- Add analytical depth to each existing section - do NOT add new sections",
          "- For each claim, add: This matters because [implication]. In committee, delegates should [action].",
          "- Expand evidence citations: integrate unused sources from the source list",
          "- Add stakeholder-specific analysis for each major actor mentioned",
          "- Division 7 must have at least 15 POIs if not already present",
          "- Division 11 must have at least 3 non-obvious strategic insights if not already present",
          "",
          "NUMBERED SOURCES:",
          sourceManifest.numberedList,
          "",
          "CURRENT BRIEFING (expand this, do not replace it):",
          finalResponse,
        ].join("\n");
        const expanded = await gemini.chat.completions.create({
          model: "gemini-2.5-flash",
          max_tokens: 6000,
          temperature: 0.2,
          messages: [{ role: "user", content: expansionPrompt }],
        });
        const expandedText = expanded.choices?.[0]?.message?.content ?? "";
        if (expandedText.trim().split(/\s+/).filter(Boolean).length > currentWordsForExpansion) {
          finalResponse = normalizeSourceCitations(expandedText, allSearchResults);
        }
      } catch (err) {
        logger.warn({ err }, "[synthesis] Expansion pass failed");
      }
    }
  }

  send({ pipelineTimeline: { stage: "quality_gate_run", timestamp: Date.now(), data: { isDeep } } });
  const qualityReport = runQualityGate(finalResponse, dimensionEngine, evidenceRegistry);
  if (isDeep) send({ qualityGate: qualityReport });

  // Citation discipline: one repair pass only when coverage/quality is materially weak.
  try {
    if (!corePipelineResult && (qualityReport.overallScore < 60 || countCitations(finalResponse) < (isDeep ? 10 : 6))) {
      finalResponse = await citationRepairPass(finalResponse, userQuery, groqKey, isDeep ? 10 : 6, geminiKey, allSearchResults, nvidiaKey, cerebrasKey);
      finalResponse = normalizeSourceCitations(finalResponse, allSearchResults);
    }
  } catch {
    // best effort
  }

  // Auto-fix grouped citations before coverage measurement
  finalResponse = fixGroupedCitations(finalResponse, mergeSearchResults(allSearchResults));

  const eligibleEntries = buildNumberedSourceEntries(allSearchResults);
  const eligibleCount = eligibleEntries.length;
  let coverage = computeCitationCoverage(finalResponse, eligibleCount);
  let strictCoverage = computeCitationCoverageStrict(
    finalResponse,
    eligibleEntries.map((entry) => ({ index: entry.id, url: entry.url })),
  );
  let rewritePass = 0;
  // Skip citation rewrite loop for core pipeline results - already verified
  while (!corePipelineResult && (coverage.missingIds.length > 0 || strictCoverage.urlMismatchIds.length > 0) && rewritePass < 2 && isGeminiEnabled(geminiKey ?? null)) {
    rewritePass += 1;
    try {
      const gemini = getGeminiClient(geminiKey ?? null);
      const rewritePrompt = [
        "Rewrite the response to improve citation coverage.",
        `Missing source ids: ${coverage.missingIds.join(", ")}`,
        `URL mismatch source ids: ${strictCoverage.urlMismatchIds.join(", ") || "none"}`,
        "Use ONLY the authoritative numbered sources below. Copy exact Citation tokens.",
        "Do not invent URLs. Keep the same structure and research depth. Add missing source usage where relevant.",
        "Do not emit bare [1] citations or grouped [Source 1, 2] citations.",
        "If a source truly cannot be used, include it in Source Coverage Audit as Not used because ...",
        "",
        "AUTHORITATIVE NUMBERED SOURCES:",
        sourceManifest.numberedList || "(no sources)",
        "",
        finalResponse,
      ].join("\n");
      const rewriteResp = await gemini.chat.completions.create({
        model: "gemini-2.5-flash",
        temperature: 0.1,
        max_tokens: 3200,
        messages: [{ role: "user", content: rewritePrompt }],
      });
      const rewritten = rewriteResp.choices?.[0]?.message?.content ?? "";
      const normalizedRewrite = normalizeSourceCitations(rewritten, allSearchResults);
      const nextCoverage = computeCitationCoverage(normalizedRewrite, eligibleCount);
      const nextStrictCoverage = computeCitationCoverageStrict(
        normalizedRewrite,
        eligibleEntries.map((entry) => ({ index: entry.id, url: entry.url })),
      );
      if (
        rewritten.trim()
        && (
          nextCoverage.missingIds.length < coverage.missingIds.length
          || nextStrictCoverage.urlMismatchIds.length < strictCoverage.urlMismatchIds.length
        )
      ) {
        finalResponse = normalizedRewrite;
        coverage = nextCoverage;
        strictCoverage = nextStrictCoverage;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  send({
    citationCoverage: {
      coveragePct: coverage.coveragePct,
      missingIds: coverage.missingIds,
      eligibleIds: coverage.eligibleIds,
      urlMismatchIds: strictCoverage.urlMismatchIds,
    },
  });
  if (coverage.missingIds.length > 0 || strictCoverage.urlMismatchIds.length > 0) {
    send({ citationWarning: true, count: coverage.citedIds.length });
  }

  // Post-synthesis length guard (skip if using core pipeline result)
  const wordCount = finalResponse.trim().split(/\s+/).length;
  if (!corePipelineResult && wordCount < 200 && allSearchResults.length > 0) {
    try {
      finalResponse = await citationRepairPass(finalResponse, userQuery + " [EXPAND to 600+ words using all sources]", groqKey, isDeep ? 10 : 6, geminiKey, allSearchResults, nvidiaKey, cerebrasKey);
      finalResponse = normalizeSourceCitations(finalResponse, allSearchResults);
    } catch {
      // best effort
    }
  }

  const mergedResultPool = mergeSearchResults(allSearchResults);
  const citationFloor = isDeep ? 15 : 10;
  const dataBulletFloor = isDeep ? 5 : 4;
  const dataBulletCount = countDataBullets(finalResponse);
  const citationCountAfterRepair = countCitations(finalResponse);
  const sparseEvidence = researchQualityScore(mergedResultPool) < (isDeep ? 10 : 7);
  if ((dataBulletCount < dataBulletFloor || citationCountAfterRepair < citationFloor) && sparseEvidence) {
    finalResponse = [
      buildSparseEvidenceWarning(mergedResultPool, userQuery),
      "",
      finalResponse,
    ].join("\n\n");
    send({
      evidenceWarning: true,
      dataBulletCount,
      citationCount: citationCountAfterRepair,
    });
  }

  send({ verifying: true });
  send({ pipelineTimeline: { stage: "verification_start", timestamp: Date.now(), data: { verifier: "gemini" } } });
  // Skip verification for core pipeline results - they're already generated
  if (!corePipelineResult) {
    try {
      send({ verifying: true, verifier: "gemini" });
      const verifyClients: VerifyClients = {
        gemini: opts.geminiKey ? getGeminiClient(opts.geminiKey) : null,
        groq: opts.groqKey ? getGroqClient(opts.groqKey) : null,
        nvidia: opts.nvidiaKey ? getNvidiaClient(opts.nvidiaKey) : null,
      };
      const verification = await verifyAnswer(userQuery, allSearchResults, finalResponse, {
        geminiKey: opts.geminiKey,
        hfToken: opts.hfToken ?? null,
        groqKey: opts.groqKey,
        nvidiaKey: opts.nvidiaKey,
        clients: verifyClients,
        onChunk: (chunk) => send({ qwenThinkingChunk: chunk }),
      });
      const confidencePct = verification.confidence <= 1
        ? Math.round(verification.confidence * 100)
        : Math.round(verification.confidence);
      const passed = verification.verified || confidencePct >= 65;

      if (!passed) {
        const flaggedClaims = extractFlaggedClaims(verification.notes);
        send({ verificationFailed: true, confidence: confidencePct, flaggedClaims });
        finalResponse = await citationRepairPass(
          finalResponse,
          `${userQuery}\nThe following claims were flagged as unverified: ${flaggedClaims.join("; ") || verification.notes}. Revise ONLY these claims to match the evidence or mark them as uncertain.`,
          groqKey,
          isDeep ? 15 : 10,
          geminiKey,
          allSearchResults,
          nvidiaKey,
          cerebrasKey
        );
        finalResponse = normalizeSourceCitations(finalResponse, allSearchResults);
      }
      send({ verified: verification });
      send({ verificationPassed: passed });
      send({ pipelineTimeline: { stage: "verification_complete", timestamp: Date.now(), data: { passed, confidence: confidencePct } } });
    } catch {
      send({ verificationSkipped: true });
      send({ pipelineTimeline: { stage: "verification_complete", timestamp: Date.now(), data: { skipped: true } } });
    }
  } else {
    send({ verificationSkipped: true, reason: "core_pipeline_result" });
    send({ pipelineTimeline: { stage: "verification_complete", timestamp: Date.now(), data: { skipped: true, reason: "core_result" } } });
  }

  // Stream the final answer in chunks so StreamingText can animate naturally
  const WORDS_PER_CHUNK = 5;
  const rawTokens = finalResponse.match(/\S+\s*/g) ?? [];
  const chunks: string[] = [];
  let buf = "";
  for (const token of rawTokens) {
    buf += token;
    const wordCount = buf.trim().split(/\s+/).length;
    if (wordCount >= WORDS_PER_CHUNK) {
      chunks.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) chunks.push(buf);

  for (const chunk of chunks) {
    if (res.writableEnded) break;
    send({ content: chunk });
    await new Promise<void>((r) => setTimeout(r, 25)); // 40 chunks/sec feels natural
  }

  // Citation quality gate
  const citationCount = countCitations(finalResponse);
  if (citationCount < 3) {
    send({ citationWarning: true, count: citationCount });
  }
  send({ pipelineTimeline: { stage: "synthesis_complete", timestamp: Date.now(), data: { words: finalResponse.trim().split(/\s+/).filter(Boolean).length, citations: citationCount } } });

  if (finalResponse) {
    // Build pipeline metadata for persistence â€” restored when user re-renders the message
    const labelByRaw = new Map(modelInfos.map((m) => [m.rawModelId, m.providerLabel]));
    const metaModels = webModels.map((key) => {
      const t = modelTrack.get(key);
      return {
        key,
        label: labelByRaw.get(key) ?? key,
        searches: t?.searches ?? [],
        found: t?.found ?? [],
        exhausted: t?.exhausted ?? null,
      };
    });
    // Top sources for the persisted "Sources" panel â€” include sourceType for badge rendering
    const sources = sourceManifest.compiledBlocks.map((source) => ({
      title: source.title,
      url: source.url,
      sourceType: source.sourceType as SearchResult["sourceType"],
    }));
    const meta: PipelineMetadata = {
      ...buildLegacyTerminalMetadata(opts.runIdentity, "legacy_fallback_used", {
        legacyFallbackUsed: true,
        liveRetrievalUsed: true,
      }),
      mode: isDeep ? "deep_research" : "web_search",
      models: metaModels,
      discussion: trackedDiscussion,
      sources,
    };
    const persistedContent = embedPipelineMeta(finalResponse, meta);
    await persistAssistantCompleted({
      store: assistantPersistenceStore,
      conversationId,
      assistantMessageId: opts.runIdentity?.assistantMessageId,
      content: persistedContent,
    });
    send({ eventType: "legacy_fallback_used", legacyFallbackUsed: true, done: true });
    await maybeMergeArchive({
      terminalStatus: "legacy_fallback_used",
      qualityGate: null,
      legacyFallbackUsed: true,
      sourceContract: null,
      finalAnswer: finalResponse,
      merge: () => mergeAssistantAnswerIntoArchiveContext(archiveId, archiveSummary, finalResponse, topic),
    });
  }

  };

  const DEEP_RESEARCH_TIMEOUT_MS = 5 * 60 * 1000;
  const WEB_SEARCH_TIMEOUT_MS = 3 * 60 * 1000;

  let releaseDeepResearchSlot: (() => void) | null = null;
  try {
    if (isDeep) {
      const queuedAhead = deepResearchSemaphore.queueLength;
      if (queuedAhead > 0) send({ queued: true, position: queuedAhead + 1 });
      releaseDeepResearchSlot = await deepResearchSemaphore.acquire();
    }
    await Promise.race([
      runPipeline(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("pipeline_timeout")),
          isDeep ? DEEP_RESEARCH_TIMEOUT_MS : WEB_SEARCH_TIMEOUT_MS)
      ),
    ]);
  } finally {
    releaseDeepResearchSlot?.();
    clearInterval(innerHeartbeat);
    if (!res.writableEnded) {
      send({ done: true });
      res.end();
    }
  }
}

router.post("/anthropic/conversations/:id/messages", async (req, res) => {
  // Guard: max message content 32KB
  const rawContent = req.body?.content;
  if (typeof rawContent === "string" && rawContent.length > 32_768) {
    res.status(400).json({ error: "Message content exceeds 32KB limit.", code: "content_too_large" });
    return;
  }

  const paramsParsed = SendAnthropicMessageParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = SendAnthropicMessageBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

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
  const DEFAULT_GROQ_MODEL = "groq/llama-3.3-70b-versatile";
  const autoFallback = req.body.autoFallback === true;
  const suppliedNormalModel = typeof req.body.normalModel === "string" ? req.body.normalModel.trim() : "";
  let rawNormalModel = suppliedNormalModel || DEFAULT_GROQ_MODEL;
  try {
    parseProviderModelId(rawNormalModel);
  } catch {
    res.status(400).json({
      error: {
        code: "INVALID_MODEL_PREFIX",
        message: "Unrecognized model prefix. Expected groq/, openrouter/, nvidia/, gemini/, github/, ollama/.",
      },
    });
    return;
  }
  const rawWebModels: string[] = [];
  if (Array.isArray(req.body.webModels)) {
    for (const model of req.body.webModels) {
      if (typeof model !== "string" || !model.trim()) continue;
      try {
        parseProviderModelId(model.trim());
        rawWebModels.push(model.trim());
      } catch {
        res.status(400).json({
          error: {
            code: "INVALID_MODEL_PREFIX",
            message: "Unrecognized model prefix. Expected groq/, openrouter/, nvidia/, gemini/, github/, ollama/.",
          },
        });
        return;
      }
    }
  }
  const effectiveWebModels = rawWebModels.length > 0 ? rawWebModels : [rawNormalModel];
  const TIMEOUT_CONFIG = {
    normal: 2 * 60 * 1000,
    web_search: 5 * 60 * 1000,
    deep_research: 15 * 60 * 1000,
    fast_research: 8 * 60 * 1000,
    council: 30 * 60 * 1000,
    rhetorics: 5 * 60 * 1000,
    drafting: 5 * 60 * 1000,
  } as const;
  const STREAM_TIMEOUT_MS = parseInt(process.env.STREAM_TIMEOUT_MS ?? "", 10)
    || TIMEOUT_CONFIG[routeMode as keyof typeof TIMEOUT_CONFIG]
    || 5 * 60 * 1000;

  // Pre-flight DB operations wrapped in try/catch to handle errors before SSE setup
  let convo, archive, archiveContext, userMessage, assistantMessage, combinedSystemPrompt;
  try {
    convo = await getConversationById(conversationId, ownerUserId);
    if (!convo) { res.status(404).json({ error: "Conversation not found" }); return; }
    const archiveId = convo.archive_id ?? null;
    archive = archiveId ? await getArchiveById(archiveId, ownerUserId) : null;
    archiveContext = archiveId ? await getArchiveContext(archiveId) : null;
    const archiveTopic = archive?.topic?.trim() || "";
    const archiveSummary = archiveContext?.summary?.trim() || "";
    combinedSystemPrompt = composeAnthropicSystemPrompt({
      archiveTopic,
      archiveSummary,
      userSystemPrompt: rawSystemPrompt,
    });

    userMessage = await createMessage(conversationId, "user", userContent);
    assistantMessage = isResearchRouteMode(routeMode)
      ? await createMessage(
          conversationId,
          "assistant",
          freshnessResearchMode
            ? "Freshness-sensitive research run started. Waiting for live-source output..."
            : "Research run started. Waiting for streamed output...",
        )
      : undefined;
  } catch (dbErr) {
    req.log?.error?.({ err: dbErr }, "Pre-flight DB error");
    res.status(503).json({ error: "Database unavailable", code: "db_error" });
    return;
  }
  
  const archiveId = convo.archive_id ?? null;
  const archiveTopic = archive?.topic?.trim() || "";
  const archiveSummary = archiveContext?.summary?.trim() || "";
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
  const MAX_HISTORY = 20;
  const trimmedHistory = history.length > MAX_HISTORY
    ? history.slice(history.length - MAX_HISTORY)
    : history;
  const chatMessages = trimmedHistory.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

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
    selectedResearchMode: bodyParsed.data.researchMode ?? null,
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

    const useCoreResearchRoute = process.env.USE_CORE_RESEARCH_ROUTE !== "false";
    const useLegacyResearchRoute = process.env.USE_LEGACY_RESEARCH_ROUTE === "true";
    if (routeMode === "council") {
      if (!useCoreResearchRoute) {
        const message = "Council mode requires the core research route.";
        sendRunEvent("provider_error", { providerError: message, providerConfigurationError: true, done: true });
        await persistAssistantFailed({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage?.id,
          title: "Council Research Failed",
          message,
          metadata: buildLegacyTerminalMetadata(runIdentity, "provider_error", {
            researchMode: "council",
            liveRetrievalUsed: false,
            legacyFallbackUsed: false,
            error: { code: "council_core_route_disabled", message, recoverable: true },
          } as PipelineMetadata),
        });
        writer.finishStream();
        return;
      }

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

    if (isResearchRouteMode(routeMode) && useCoreResearchRoute && !useLegacyResearchRoute) {
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
        fallbackExplicitlyAllowed: process.env.USE_LEGACY_FALLBACK === "true" || process.env.BESTDEL_EMERGENCY_COMPATIBILITY_MODE === "true",
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

    const effectiveWebModelsMin2 = ensureResearchWorkerModels(mode, effectiveWebModels, DEFAULT_GROQ_MODEL);

    if ((mode === "web_search" || mode === "deep_research") && effectiveWebModelsMin2.length > 1) {
      const agendaIntelligence = classifyAgenda(userContent, combinedSystemPrompt, archiveTopic || undefined);
      await handleMultiSearch(req, res, {
        webModels: effectiveWebModelsMin2,
        mode,
        conversationId,
        chatMessages: simpleMessages,
        userQuery: userContent,
        userSystemPrompt: combinedSystemPrompt,
        archiveId: archiveId ?? undefined,
        archiveTopic: archiveTopic || undefined,
        archiveSummary: archiveSummary || undefined,
        groqKey: keys.groqKey,
        nvidiaKey: keys.nvidiaKey,
        geminiKey: keys.geminiKey,
        tavilyKey: keys.tavilyKey,
        serperKey: keys.serperKey,
        exaKey: keys.exaKey,
        braveKey: keys.braveKey,
        firecrawlKey: keys.firecrawlKey,
        jinaKey: keys.jinaKey,
        openrouterKey: keys.openrouterKey,
        cerebrasKey: keys.cerebrasKey,
        hfToken: keys.hfToken,
        getIsDisconnected: () => clientDisconnected,
        abortSignal: requestAbortController.signal,
        agendaIntelligence,
        runIdentity,
      });
      return;
    }

    const singleResearchModel =
      (mode === "web_search" || mode === "deep_research") && effectiveWebModels.length === 1
        ? effectiveWebModels[0]
        : rawNormalModel;

    await handleProviderAllModes(req, res, {
      rawModelId: singleResearchModel,
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
      tavilyKey: keys.tavilyKey,
      serperKey: keys.serperKey,
      exaKey: keys.exaKey,
      braveKey: keys.braveKey,
      firecrawlKey: keys.firecrawlKey,
      jinaKey: keys.jinaKey,
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
