import { buildAgendaContract } from "../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../src/core/retrieval/query-planner.js";
import { runBucketedRetrieval } from "../src/core/retrieval/bucketed-retrieval.js";

const contract = buildAgendaContract({
  requestId: "smoke-research-retrieval",
  originalUserQuery: "Supreme Court federalism parliamentary accountability India",
});
const basePlan = buildBucketedQueryPlan(contract, "fast_research");
const plan = { ...basePlan, queries: basePlan.queries.slice(0, 2) };
const providerKeys = {
  serper: process.env.SERPER_API_KEY,
  exa: process.env.EXA_API_KEY,
  tavily: process.env.TAVILY_API_KEY,
  brave: process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY,
  firecrawl: process.env.FIRECRAWL_API_KEY,
  jina: process.env.JINA_API_KEY ?? process.env.JINA_KEY,
};
const live = Boolean(providerKeys.serper || providerKeys.exa || providerKeys.tavily || providerKeys.brave);

const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
const result = await runBucketedRetrieval(plan, {
  mode: "fast_research",
  live,
  allowMock: !live,
  providerKeys,
  maxResultsPerQuery: 2,
  maxRawResults: 8,
  maxSourcesToEnrich: 3,
  timeoutMs: 8000,
  emit: (event) => events.push(event),
});

console.log(`Retrieval smoke live=${live} raw=${result.rawResults.length} enriched=${result.enrichedResults.length} citationEligible=${result.citationEligibleEstimate}`);
console.log(`Providers: ${[...new Set(result.rawResults.map((source) => source.provider))].join(", ") || "none"}`);
console.log(`Extraction: ${[...new Set(result.enrichedResults.map((source) => source.extractionProvider ?? source.extractionQuality))].join(", ") || "none"}`);
if (!live) console.log("No live search keys configured; deterministic mock retrieval was used honestly.");
