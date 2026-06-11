import { buildAgendaContract } from "../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlanWithExpansion } from "../src/core/retrieval/query-planner.js";
import { runBucketedRetrieval } from "../src/core/retrieval/bucketed-retrieval.js";
import type { ResearchMode } from "../src/core/config/research-mode.js";

const mode = (process.env.LIVE_RESEARCH_MODE ?? "fast_research") as ResearchMode;
const minimumSourceCount = Number(process.env.LIVE_MIN_SOURCES ?? (mode === "deep_research" ? 80 : mode === "council" ? 180 : 40));
const liveQuestion = process.env.LIVE_RESEARCH_QUESTION?.trim() || process.env.LIVE_RESEARCH_QUERY?.trim();
const defaultQuestion = "Should the Election Commission and Union Government regulate online political advertising, deepfakes, and platform transparency during elections?";
const modeLabel = mode === "council" ? "Council" : mode === "deep_research" ? "Deep" : "Fast";
const query = [
  `${modeLabel} research for an AIPPM debate in India:`,
  liveQuestion || defaultQuestion,
].join(" ");

const contract = buildAgendaContract({
  requestId: `live-retrieval-contract-${mode}`,
  originalUserQuery: query,
  outputDepth: mode === "fast_research" ? "brief" : "deep_research",
});
const plan = await buildBucketedQueryPlanWithExpansion(contract, mode);
const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
const result = await runBucketedRetrieval(plan, {
  mode,
  live: true,
  allowMock: false,
  providerKeys: {
    tavily: process.env.TAVILY_API_KEY,
    brave: process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY,
    serper: process.env.SERPER_API_KEY ?? process.env.SERPER_KEY,
    exa: process.env.EXA_API_KEY,
    firecrawl: process.env.FIRECRAWL_API_KEY,
    jina: process.env.JINA_API_KEY ?? process.env.JINA_KEY,
    scraperapi: process.env.SCRAPERAPI_KEY,
    zenrows: process.env.ZENROWS_API_KEY,
    scrapingbee: process.env.SCRAPINGBEE_API_KEY,
    geekflare: process.env.GEEKFLARE_API_KEY,
  },
  maxResultsPerQuery: Number(process.env.LIVE_RESEARCH_MAX_RESULTS_PER_QUERY ?? 10),
  maxSourcesToEnrich: Number(process.env.LIVE_MAX_SOURCES_TO_ENRICH ?? (mode === "deep_research" ? 180 : mode === "council" ? 220 : 90)),
  useCache: process.env.LIVE_RESEARCH_USE_CACHE !== "false",
  extractionTimeoutMs: Number(process.env.EXTRACTION_TIMEOUT_MS ?? 8000),
  emit: (event) => events.push(event),
});

const breakdown = result.enrichedResults.reduce<Record<string, number>>((acc, source) => {
  const key = source.extractionProvider ?? source.extractionQuality ?? "unknown";
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
const eligibleByBucket = result.enrichedResults
  .filter((source) => source.citationEligible)
  .reduce<Record<string, number>>((acc, source) => {
    for (const bucket of source.bucketIds) acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});

const summary = {
  ok: result.citationEligibleEstimate >= minimumSourceCount,
  mode,
  minimumSourceCount,
  plannedQueries: plan.queries.length,
  rawResults: result.rawResults.length,
  dedupedResults: result.dedupedResults.length,
  filteredResults: result.filteredResults.length,
  enrichedResults: result.enrichedResults.length,
  citationEligibleSources: result.citationEligibleEstimate,
  extractionProviderBreakdown: breakdown,
  eligibleByBucket,
  sourceGap: result.sourceGapReport?.explanation ?? null,
  failedBuckets: result.failedBuckets,
  weakBuckets: result.weakBuckets,
  topUpAttempts: result.topUpAttempts,
  providerErrors: result.providerErrors.slice(0, 10),
  enrichmentFailures: result.enrichmentFailures.length,
  cacheEvents: events.filter((event) => event.type.startsWith("retrieval_cache")).length,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) throw new Error(`Live retrieval contract failed: ${result.citationEligibleEstimate}/${minimumSourceCount} citation-eligible sources`);
