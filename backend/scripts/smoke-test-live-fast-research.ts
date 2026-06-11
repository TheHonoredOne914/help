import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runResearchPipeline } from "../src/core/pipeline/research-pipeline.js";
import { stripPipelineMetadata } from "../src/core/pipeline/pipeline-metadata.js";
import { buildProviderStatusPayload } from "../src/routes/providers.js";
import { buildCoreProviderRouter } from "../src/services/anthropic-service.js";
import type { PipelineEvent } from "../src/core/pipeline/pipeline-events.js";
import type { RequestKeys } from "../src/lib/types.js";

const keys: RequestKeys = {
  groqKey: process.env.GROQ_API_KEY ?? null,
  ollamaKey: process.env.OLLAMA_API_KEY ?? null,
  ollamaBase: process.env.OLLAMA_BASE_URL ?? null,
  nvidiaKey: process.env.NVIDIA_API_KEY ?? null,
  geminiKey: process.env.GEMINI_API_KEY ?? null,
  openrouterKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY ?? null,
  githubToken: process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? null,
  tavilyKey: process.env.TAVILY_API_KEY ?? null,
  hfToken: process.env.HF_TOKEN ?? null,
  serperKey: process.env.SERPER_API_KEY ?? process.env.SERPER_KEY ?? null,
  exaKey: process.env.EXA_API_KEY ?? null,
  braveKey: process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY ?? null,
  firecrawlKey: process.env.FIRECRAWL_API_KEY ?? null,
  jinaKey: process.env.JINA_API_KEY ?? process.env.JINA_KEY ?? null,
  scraperapiKey: process.env.SCRAPERAPI_KEY ?? null,
  zenrowsKey: process.env.ZENROWS_API_KEY ?? null,
  scrapingbeeKey: process.env.SCRAPINGBEE_API_KEY ?? null,
  geekflareKey: process.env.GEEKFLARE_API_KEY ?? null,
  cerebrasKey: process.env.CEREBRAS_API_KEY ?? null,
  openaiKey: process.env.OPENAI_API_KEY ?? null,
};

const mode = (process.env.LIVE_RESEARCH_MODE ?? "fast_research") as "fast_research" | "deep_research" | "council";
if (mode !== "fast_research" && mode !== "deep_research" && mode !== "council") {
  throw new Error(`smoke-test-live-fast-research supports fast_research/deep_research/council only; received ${mode}`);
}
const selectedModel = process.env.LIVE_FAST_RESEARCH_MODEL ?? process.env.LIVE_RESEARCH_MODEL ?? "groq/openai/gpt-oss-120b";
const liveQuestion = process.env.LIVE_RESEARCH_QUESTION?.trim();
const useCache = process.env.LIVE_RESEARCH_USE_CACHE !== "false";
const autoFallback = process.env.LIVE_RESEARCH_AUTO_FALLBACK !== "false";
const minimumSourceCount = Number(process.env.LIVE_MIN_SOURCES ?? process.env.LIVE_FAST_MIN_SOURCES ?? (mode === "council" ? 180 : mode === "deep_research" ? 80 : 40));
const minimumWordCount = Number(process.env.LIVE_MIN_WORDS ?? (mode === "council" ? 3000 : mode === "deep_research" ? 2000 : 1000));
const maximumWordCount = Number(process.env.LIVE_MAX_WORDS ?? (mode === "council" ? 5500 : mode === "deep_research" ? 3000 : 0));
const defaultQuestion = "Should the Election Commission and Union Government regulate online political advertising, deepfakes, and platform transparency during elections?";
const runtimeQuestion = [
  `${mode === "council" ? "Council" : mode === "deep_research" ? "Deep" : "Fast"} research for an AIPPM debate in India:`,
  liveQuestion || defaultQuestion,
].join(" ");
const coreProvider = buildCoreProviderRouter(keys, selectedModel);
if (coreProvider.error || !coreProvider.router || !coreProvider.providerName || !coreProvider.model) {
  throw new Error(coreProvider.error ?? `Unable to build core provider router for ${selectedModel}`);
}

const statusPayload = await buildProviderStatusPayload(keys, {
  bypassCache: true,
  timeoutMs: Number(process.env.PROVIDER_STATUS_TIMEOUT_MS ?? 15_000),
});
const providerStatuses = Object.entries(statusPayload.providers).map(([providerName, status]) => ({
  providerName,
  ...status,
}));

const requiredHealthy = [coreProvider.providerName];
const missingHealthy = requiredHealthy.filter((name) => statusPayload.providers[name]?.healthy !== true);
if (missingHealthy.length > 0) {
  throw new Error(`Live ${mode} prerequisites unhealthy: ${missingHealthy.join(", ")}`);
}
const searchProviders = ["tavily", "serper", "exa", "brave"];
const healthySearchProviders = searchProviders.filter((name) => statusPayload.providers[name]?.healthy === true);
if (healthySearchProviders.length === 0) {
  throw new Error(`Live ${mode} prerequisites unhealthy: no search provider is healthy`);
}
const extractionProviders = ["firecrawl", "jina", "scraperapi", "zenrows", "scrapingbee", "geekflare"];
const healthyExtractionProviders = extractionProviders.filter((name) => statusPayload.providers[name]?.healthy === true);
const localExtractorEnabled = process.env.LOCAL_EXTRACTOR_FIRST !== "false";
if (healthyExtractionProviders.length === 0 && !localExtractorEnabled) {
  throw new Error(`Live ${mode} prerequisites unhealthy: no extraction provider is healthy`);
}

const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
const startedAt = Date.now();
let result: Awaited<ReturnType<typeof runResearchPipeline>>;
try {
  result = await runResearchPipeline({
  runId: `live_${mode}_${startedAt.toString(36)}`,
  requestId: `smoke_live_${mode}_${startedAt.toString(36)}`,
  conversationId: `smoke-live-${mode}`,
  assistantMessageId: `smoke-live-${mode}-assistant`,
  userQuery: runtimeQuestion,
  mode,
  liveRetrieval: true,
  allowMockRetrieval: false,
  allowSyntheticSourceUsage: false,
  searchOptions: {
    live: true,
    allowMock: false,
    mode,
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
    maxResultsPerQuery: Number(process.env.LIVE_RESEARCH_MAX_RESULTS_PER_QUERY ?? 10),
    maxSourcesToEnrich: Number(process.env.LIVE_MAX_SOURCES_TO_ENRICH ?? (mode === "council" ? 360 : mode === "deep_research" ? 300 : 90)),
    useCache,
  },
  generationMode: "model",
  providerRouter: coreProvider.router,
  providerName: coreProvider.providerName,
  model: coreProvider.model,
  userSelectedModels: [selectedModel],
  providerStatuses: providerStatuses as any,
  autoFallback,
  trustRegisteredProvidersWithoutStatus: false,
  emit: (event: PipelineEvent) => {
    events.push({ type: event.type, data: event.data as Record<string, unknown> | undefined });
  },
  });
} catch (error) {
  const failureDebugPath = resolve("live-fast-research-failure-debug.json");
  writeFileSync(failureDebugPath, JSON.stringify({
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    selectedModel,
    resolvedProvider: coreProvider.providerName,
    resolvedModel: coreProvider.model,
    elapsedMs: Date.now() - startedAt,
    sourceEnrichment: events.filter((event) => event.type === "source_enrichment_completed").map((event) => event.data),
    sourceUsage: events.filter((event) => event.type.startsWith("source_usage")).map((event) => event.data ? { type: event.type, data: event.data } : { type: event.type }),
    modelRoles: events.filter((event) => event.type.startsWith("model_role")).map((event) => event.data ? { type: event.type, data: event.data } : { type: event.type }),
    lastEvents: events.slice(-25),
  }, null, 2), "utf8");
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    failureDebugPath,
    elapsedMs: Date.now() - startedAt,
    lastEvents: events.slice(-10).map((event) => ({ type: event.type, data: event.data })),
  }, null, 2));
  throw error;
}

const visibleAnswer = stripPipelineMetadata(result.finalAnswer).trim();
const wordCount = visibleAnswer.split(/\s+/).filter(Boolean).length;
const hasJavascriptTrash = /JavaScript must be enabled|Decrease Font Size|Increase Font Size|Normal Theme|Green Theme|Orange Theme|Sitemap|Advance Search|Ooops|Page not found/i.test(visibleAnswer);
const outputPath = resolve(`live-${mode}-answer.md`);
const debugPath = resolve(`live-${mode}-debug.json`);
const retrievalEventTypes = new Set([
  "bucket_search_started",
  "bucket_search_completed",
  "bucket_topup_started",
  "source_dedup_completed",
  "source_filter_completed",
  "source_enrichment_started",
  "source_enrichment_completed",
  "source_enrichment_repair_started",
  "source_enrichment_repair_completed",
  "source_gap_report_created",
  "evidence_registry_created",
]);
writeFileSync(outputPath, visibleAnswer, "utf8");
writeFileSync(debugPath, JSON.stringify({
  terminalStatus: result.terminalStatus,
  retrievalEvents: events
    .filter((event) => retrievalEventTypes.has(event.type) || event.type.startsWith("retrieval_cache"))
    .map((event) => ({ type: event.type, data: event.data })),
  citedSourceIds: result.citationReport.sourceIdsActuallyUsed,
  citationEligibleSources: result.evidenceRegistry.getCitationEligibleSources().map((source) => ({
    id: source.id,
    title: source.title,
    domain: source.domain,
    sourceClass: source.sourceClass,
    bucketIds: source.bucketIds,
    extractionQuality: source.extractionQuality,
    citationStrength: source.citationStrength,
    limitedSource: source.limitedSource,
    citationEligible: source.citationEligible,
    keyFacts: source.keyFacts.slice(0, 2),
    topChunks: source.topChunks.slice(0, 2).map((chunk) => chunk.text.slice(0, 240)),
  })),
  sourceUsageAggregate: {
    passed: result.sourceUsageAggregate.passed,
    validUsedSourceIds: result.sourceUsageAggregate.validUsedSourceIds,
    rolesFailed: result.sourceUsageAggregate.rolesFailed,
    failureReports: result.sourceUsageAggregate.failureReports.map((report) => ({
      roleName: report.roleName,
      reason: report.reason,
      failedSourceIds: report.failedSourceIds,
      validUsageCount: report.validUsageCount,
      invalidUsageCount: report.invalidUsageCount,
      structuredFailures: report.structuredFailures,
    })),
  },
  modelRoleOutputs: result.modelRoleOutputs.map((role) => ({
    roleName: role.roleName,
    sourceUsageRequirementSatisfied: role.sourceUsageRequirementSatisfied,
    usedSourceIds: role.usedSourceIds,
    sourceUsageCount: role.sourceUsageCount,
    failureReason: role.failureReason,
    sourceUsageMap: role.sourceUsageMap.map((item) => ({
      sourceId: item.sourceId,
      usageType: item.usageType,
      extractedClaim: item.extractedClaim,
      extractedNumber: item.extractedNumber,
      legalHolding: item.legalHolding,
      limitation: item.limitation,
      confidence: item.confidence,
      citationStrength: item.citationStrength,
      limitedSource: item.limitedSource,
    })),
  })),
}, null, 2), "utf8");

const completedWithSourceGaps =
  result.terminalStatus === "completed_with_source_gaps"
  && Boolean(result.sourceGapReport)
  && result.citationReport.uniqueCitedSourceCount >= minimumSourceCount;
const sourceUsageAccepted =
  result.sourceUsageAggregate.passed
  || (completedWithSourceGaps && result.sourceUsageAggregate.validUsedSourceIds.length > 0);

const summary = {
  ok: (result.terminalStatus === "completed" || completedWithSourceGaps)
    && wordCount >= minimumWordCount
    && (maximumWordCount <= 0 || wordCount <= maximumWordCount)
    && result.qualityGate.passed
    && sourceUsageAccepted
    && result.evidenceRegistry.getCitationEligibleCount() >= minimumSourceCount
    && (result.sourceUsageAggregate.passed ? result.sourceUsageAggregate.validUsedSourceIds.length >= minimumSourceCount : sourceUsageAccepted)
    && result.citationReport.uniqueCitedSourceCount >= minimumSourceCount
    && !hasJavascriptTrash
    && !result.usedLegacyFallback,
  terminalStatus: result.terminalStatus,
  wordCount,
  minimumWordCount,
  maximumWordCount: maximumWordCount || null,
  minimumSourceCount,
  qualityGatePassed: result.qualityGate.passed,
  qualityGateScore: result.qualityGate.score,
  qualityGateRepairRequired: result.qualityGate.repairRequired,
  qualityGateFatalIssues: result.qualityGate.fatalIssues,
  qualityGateAutomaticFailures: result.qualityGate.automaticFailures,
  uniqueCitedSources: result.citationReport.uniqueCitedSourceCount,
  linkedCitations: result.citationReport.linkedCitationCount,
  citationEligibleSources: result.evidenceRegistry.getCitationEligibleCount(),
  sourceUsagePassed: result.sourceUsageAggregate.passed,
  sourceUsageRolesFailed: result.sourceUsageAggregate.rolesFailed,
  sourceUsageFailureCount: result.sourceUsageAggregate.failureReports.length,
  sourceUsageFailureReasons: result.sourceUsageAggregate.failureReports.map((report) => report.reason).slice(0, 5),
  sourceGap: result.sourceGapReport?.explanation ?? null,
  hasJavascriptTrash,
  usedCoreGeneration: result.usedCoreGeneration,
  usedLegacyFallback: result.usedLegacyFallback,
  selectedModel,
  resolvedProvider: coreProvider.providerName,
  resolvedModel: coreProvider.model,
  outputPath,
  debugPath,
  elapsedMs: Date.now() - startedAt,
  lastEvents: events.slice(-10).map((event) => ({
    type: event.type,
    terminalStatus: event.data?.terminalStatus,
    errorCode: event.data?.errorCode,
    citations: event.data?.citations,
    deterministicCitedFallbackUsed: event.data?.deterministicCitedFallbackUsed,
  })),
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) {
  throw new Error(`Live ${mode} failed acceptance: ${JSON.stringify({
    terminalStatus: summary.terminalStatus,
    wordCount,
    qualityGatePassed: summary.qualityGatePassed,
    citationEligibleSources: summary.citationEligibleSources,
    sourceUsagePassed: summary.sourceUsagePassed,
    validUsedSources: result.sourceUsageAggregate.validUsedSourceIds.length,
    uniqueCitedSources: summary.uniqueCitedSources,
    hasJavascriptTrash: summary.hasJavascriptTrash,
    usedLegacyFallback: summary.usedLegacyFallback,
  })}`);
}
