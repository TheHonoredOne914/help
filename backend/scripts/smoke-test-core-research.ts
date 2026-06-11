import { canMergeResearchAnswerIntoArchive } from "../src/core/archive/archive-merge-safety.js";
import { evaluateSourceContract } from "../src/core/evidence/source-contract.js";
import type { EvidenceSource } from "../src/core/evidence/evidence-registry.js";
import { decideFinalResearchStatus } from "../src/core/pipeline/final-status.js";
import type { PipelineEvent } from "../src/core/pipeline/pipeline-events.js";
import { runResearchPipeline } from "../src/core/pipeline/research-pipeline.js";

type SmokeMode = "fast_research" | "deep_research" | "deep_research" | "council";

const mode = parseMode(process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1]);
const prompt = "Analyze India democratic space and civil liberties for Indian Mock Parliament with Treasury Bench, Opposition, POIs, rebuttals, and sources.";
const events: PipelineEvent[] = [];
const preloadedSources = buildSmokeSources(mode === "fast_research" ? 10 : 15);

const result = await runResearchPipeline({
  runId: "smoke_core_research_run",
  requestId: "smoke_core_research_request",
  conversationId: "smoke_core_research_conversation",
  assistantMessageId: "smoke_core_research_message",
  userQuery: prompt,
  mode,
  preloadedSources,
  liveRetrieval: false,
  allowMockRetrieval: false,
  generationMode: "deterministic",
  allowSyntheticSourceUsage: true,
  emit: (event) => events.push(event),
});

const queryCount = Number(findEventData("source_bucket_plan_created")?.queries ?? 0);
const sourceFilter = findEventData("source_filter_completed");
const citationStatus = {
  finalUniqueCitedSources: result.citationReport.uniqueCitedSourceCount,
  totalLinkedCitations: result.citationReport.linkedCitationCount,
  citedSourceIds: result.citationReport.sourceIdsActuallyUsed,
  citationCoverage: result.evidenceRegistry.getCitationEligibleCount() > 0
    ? result.citationReport.uniqueCitedSourceCount / result.evidenceRegistry.getCitationEligibleCount()
    : 0,
  invalidCitations: result.citationReport.invalidCitations,
  citedBuckets: result.citationReport.citedBuckets,
};
const sourceContract = evaluateSourceContract({
  mode,
  requiredSources: result.agendaContract.minimumUniqueCitedSources,
  citationEligibleSources: result.evidenceRegistry.getCitationEligibleCount(),
  finalUniqueCitedSources: result.citationReport.uniqueCitedSourceCount,
  bucketCoverage: result.evidenceRegistry.getBucketCoverage(),
  requiredBuckets: result.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId),
  sourceGapReport: result.sourceGapReport,
  categoryScores: result.qualityGate.categoryScores,
});
const sourceUsageFailureReports = result.modelRoleOutputs
  .map((output) => output.sourceUsageFailureReport)
  .filter(Boolean);
const terminalStatus = decideFinalResearchStatus({
  mode,
  coreGenerationUsed: result.usedCoreGeneration,
  legacyFallbackUsed: result.usedLegacyFallback,
  sourceContract,
  sourceGapReport: result.sourceGapReport,
  qualityGate: result.qualityGate,
  citationStatus,
  sourceUsageFailureReports,
  visibleAnswer: result.finalAnswer,
});
const canMergeIntoArchive = canMergeResearchAnswerIntoArchive({
  terminalStatus,
  qualityGate: result.qualityGate,
  legacyFallbackUsed: result.usedLegacyFallback,
  sourceContract,
  finalAnswer: result.finalAnswer,
});

const output = {
  selectedMode: mode,
  provider: "deterministic",
  model: "local-core-smoke",
  queryCount,
  rawSourceCount: preloadedSources.length,
  filteredSourceCount: Number(sourceFilter?.kept ?? result.evidenceRegistry.sources.length),
  citationEligibleSourceCount: result.evidenceRegistry.getCitationEligibleCount(),
  evidenceRegistryCount: result.evidenceRegistry.sources.length,
  sourceUsageMapValidCount: Math.max(0, ...result.modelRoleOutputs.map((role) => role.sourceUsageCount)),
  sourceContract,
  citationStatus,
  qualityGate: {
    passed: result.qualityGate.passed,
    score: result.qualityGate.score,
    repairRequired: result.qualityGate.repairRequired,
    automaticFailures: result.qualityGate.automaticFailures,
    warnings: result.qualityGate.warnings,
  },
  terminalStatus,
  legacyFallbackUsed: result.usedLegacyFallback,
  canMergeIntoArchive,
};

console.log(JSON.stringify(output, null, 2));

if (terminalStatus === "completed" && !canMergeIntoArchive) {
  console.error("core research smoke failed: strict completion was not archive-mergeable");
  process.exit(1);
}
if (result.usedLegacyFallback) {
  console.error("core research smoke failed: legacy fallback was used");
  process.exit(1);
}

function parseMode(value: string | undefined): SmokeMode {
  if (value === "fast_research" || value === "deep_research" || value === "deep_research" || value === "council") return value;
  return "deep_research";
}

function findEventData(type: string): Record<string, unknown> | undefined {
  return events.find((event) => event.type === type)?.data as Record<string, unknown> | undefined;
}

function buildSmokeSources(count: number): EvidenceSource[] {
  const classes: EvidenceSource["sourceClass"][] = [
    "official_government",
    "parliamentary_records",
    "court_primary",
    "legal_commentary",
    "policy_research",
    "indian_major_media",
    "human_rights_watchdog",
    "democracy_index",
    "press_freedom_index",
    "digital_rights_watchdog",
    "electoral_body",
    "academic_journal",
    "civic_space_monitor",
    "comparative_democracy",
    "policy_research",
  ];
  const buckets = [
    "government_official",
    "parliamentary_records",
    "court_legal",
    "legal_commentary",
    "policy_research",
    "indian_major_media",
    "human_rights_watchdog",
    "democracy_index",
    "press_freedom",
    "digital_rights",
    "electoral_integrity",
    "academic_research",
    "civic_space",
    "comparative_democracy",
    "government_official",
  ] as const;

  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const sourceClass = classes[index % classes.length];
    const bucketId = buckets[index % buckets.length];
    const claim = `Smoke source ${id} gives a distinct evidence point on democratic accountability, constitutional oversight, and Indian parliamentary debate utility.`;
    return {
      id,
      title: `Core research smoke source ${id}`,
      url: `https://example.org/bestdel-core-smoke/source-${id}`,
      canonicalUrl: `https://example.org/bestdel-core-smoke/source-${id}`,
      domain: "example.org",
      date: "2025-01-01",
      snippet: `${claim} It supports Treasury Bench and Opposition analysis with a ${20 + id}% relevance marker.`,
      fullText: `${claim} The source includes debate-ready details for POIs, rebuttals, motions, amendments, and committee recommendations.`,
      bucketIds: [bucketId],
      sourceClass,
      authorityScore: 80 + (id % 10),
      extractionQuality: "full",
      keyFacts: [claim],
      keyNumbers: [`${20 + id}%`],
      legalHoldings: sourceClass === "court_primary" || sourceClass === "legal_commentary"
        ? [`Smoke legal source ${id} frames a proportionality and constitutional accountability holding.`]
        : [],
      namedEntities: ["India", "Parliament", "Supreme Court"],
      limitations: ["Synthetic smoke source; validates pipeline mechanics without external provider keys."],
      citationEligible: true,
      confidence: "medium",
    };
  });
}
