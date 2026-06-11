import { buildAgendaContract } from "../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../src/core/retrieval/query-planner.js";
import { runResearchPipeline } from "../src/core/pipeline/research-pipeline.js";

const prompt = "Analyze India's declining democratic space from 2022-2025 using Freedom House, V-Dem, EIU, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, EVM/VVPAT allegations, electoral bonds, RSF, EPW, MHA, ECI, The Hindu, and Indian Express.";
const mode = "council" as const;
const hasSearchKey = Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY || process.env.SERPER_API_KEY);
const hasModelKey = Boolean(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);
const contract = buildAgendaContract({ requestId: "smoke-democracy", originalUserQuery: prompt, outputDepth: "deep_research" });
const plan = buildBucketedQueryPlan(contract, mode);
const uniqueQueries = new Set(plan.queries.map((query) => query.query.toLowerCase()));
const duplicateQueryRate = plan.queries.length ? Number(((plan.queries.length - uniqueQueries.size) / plan.queries.length).toFixed(3)) : 0;

let liveReport: Record<string, unknown> = {};
if (hasSearchKey && hasModelKey && process.env.LIVE_SEARCH_TESTS === "true") {
  const result = await runResearchPipeline({
    requestId: "smoke-democracy-live",
    userQuery: prompt,
    mode,
    liveRetrieval: true,
    allowMockRetrieval: false,
    allowSyntheticSourceUsage: false,
  });
  liveReport = {
    citationEligibleSources: result.evidenceRegistry.getCitationEligibleCount(),
    finalUniqueCitedSources: result.citationReport.uniqueCitedSourceCount,
    coreGenerationUsed: result.usedCoreGeneration,
    legacyFallbackUsed: result.usedLegacyFallback,
    SourceGapReport: result.sourceGapReport,
    qualityGateScore: result.qualityGate.score,
    bucketCoverage: result.evidenceRegistry.getBucketCoverage(),
    assignedSourcesPerRole: Object.fromEntries(result.modelRoleOutputs.map((role) => [role.roleName, role.receivedSourceIds.length])),
    usedSourcesPerRole: Object.fromEntries(result.modelRoleOutputs.map((role) => [role.roleName, role.sourceUsageCount])),
  };
} else {
  liveReport = {
    citationEligibleSources: 0,
    finalUniqueCitedSources: 0,
    coreGenerationUsed: "not evaluated; set LIVE_SEARCH_TESTS=true with search/model keys",
    legacyFallbackUsed: false,
    SourceGapReport: hasSearchKey ? "live model key missing or gated" : "Missing Tavily/Brave/Serper keys; live retrieval must report source gaps instead of fake success.",
    qualityGateScore: 0,
    missingKeys: [
      ...(hasSearchKey ? [] : ["TAVILY_API_KEY or BRAVE_API_KEY or SERPER_API_KEY"]),
      ...(hasModelKey ? [] : ["GROQ_API_KEY or OPENROUTER_API_KEY or GEMINI_API_KEY"]),
    ],
  };
}

const report = {
  effectiveResearchMode: mode,
  plannedQueries: plan.queries.length,
  uniqueQueries: uniqueQueries.size,
  duplicateQueryRate,
  bucketsCovered: plan.buckets.length,
  criticalBuckets: plan.buckets.map((bucket) => bucket.id),
  ...liveReport,
};

if (uniqueQueries.size < 80) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error(`FullSpectrum planner produced ${uniqueQueries.size} unique queries; expected at least 80.`);
}
if (duplicateQueryRate >= 0.1) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error(`Duplicate query rate ${duplicateQueryRate} is too high.`);
}

console.log(JSON.stringify(report, null, 2));
