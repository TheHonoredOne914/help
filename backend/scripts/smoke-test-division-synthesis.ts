import fs from "node:fs";
import { runResearchPipeline } from "../src/core/pipeline/research-pipeline.js";
import { evaluateSourceContract } from "../src/core/evidence/source-contract.js";
import { decideFinalResearchStatus } from "../src/core/pipeline/final-status.js";

const fixtureSources = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/india-democracy-sources.json", import.meta.url), "utf8"));
const events: string[] = [];
const mode = "council";

const result = await runResearchPipeline({
  requestId: "smoke-division-synthesis",
  userQuery: "FullSpectrum Indian Mock Parliament brief on India's democratic space, ECI accountability, Supreme Court doctrine, civil liberties, federalism, public order, Treasury Bench and Opposition strategy.",
  mode,
  preloadedSources: fixtureSources,
  generationMode: "deterministic",
  emit: (event) => events.push(event.type),
});

const sourceContract = evaluateSourceContract({
  mode,
  requiredSources: result.agendaContract.minimumUniqueCitedSources,
  citationEligibleSources: result.evidenceRegistry.getCitationEligibleCount(),
  finalUniqueCitedSources: result.citationReport.uniqueCitedSourceCount,
  sourceGapReport: result.sourceGapReport,
  categoryScores: result.qualityGate.categoryScores,
});
const terminalStatus = decideFinalResearchStatus({
  mode,
  coreGenerationUsed: result.usedCoreGeneration,
  legacyFallbackUsed: result.usedLegacyFallback,
  sourceContract,
  sourceGapReport: result.sourceGapReport,
  qualityGate: result.qualityGate,
  citationStatus: {
    finalUniqueCitedSources: result.citationReport.uniqueCitedSourceCount,
    totalLinkedCitations: result.citationReport.linkedCitationCount,
    citedSourceIds: result.citationReport.sourceIdsActuallyUsed,
    citationCoverage: result.citationReport.sourceIdsActuallyUsed.length / Math.max(1, result.evidenceRegistry.getCitationEligibleCount()),
  },
  visibleAnswer: result.finalAnswer,
});

const d7 = section(result.finalAnswer, "Indian Mock Parliament Debate Utility Arsenal");
const d11 = section(result.finalAnswer, "Final Strategic Synthesis");
const summary = {
  mode,
  selectedBackendProvider: "local_deterministic",
  providerHealthSummary: "no live provider keys used by this smoke",
  runWideProviderCooldowns: [],
  retrievalQueryCount: result.agendaContract.requiredSourceBuckets.length,
  sourceUsageAggregateValidCount: result.sourceUsageAggregate.validUsageCount,
  perRoleSourceUsageTargets: result.modelRoleOutputs.map((role) => ({
    role: role.roleName,
    minimum: role.minimumSourceRequirement,
    used: role.sourceCountUsed,
  })),
  divisionSynthesisProgress: events.filter((event) => event.includes("division")),
  divisionCount: result.divisionOutputs.size,
  d7: {
    hasTreasuryBench: /Treasury Bench/i.test(d7),
    hasOpposition: /Opposition/i.test(d7),
    poiCount: (d7.match(/\bPOIs?\b|Point of Information|\?/gi) ?? []).length,
    hasRebuttals: /Rebuttal/i.test(d7),
    hasClauses: /operative|preambular|amendment/i.test(d7),
  },
  d11: {
    hasDiagnosis: /\bDiagnosis\b/i.test(d11),
    hasPrescription: /\bPrescription\b/i.test(d11),
    hasWarning: /\bWarning\b/i.test(d11),
  },
  promptBudgetReport: result.coreAnswerResult?.promptBudgetReports ?? [],
  providerFailureReports: result.coreAnswerResult?.providerFailureReports ?? [],
  qualityGateStatus: result.qualityGate.passed ? "passed" : "failed",
  terminalStatus,
  isArchiveMergeAllowed: terminalStatus === "completed" && result.qualityGate.passed && sourceContract.status === "passed",
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.d7.hasTreasuryBench || !summary.d7.hasOpposition || summary.d7.poiCount < 1 || !summary.d7.hasRebuttals || !summary.d7.hasClauses) {
  throw new Error("D7 debate utility smoke failed");
}
if (!summary.d11.hasDiagnosis || !summary.d11.hasPrescription || !summary.d11.hasWarning) {
  throw new Error("D11 strategic synthesis smoke failed");
}
if (summary.sourceUsageAggregateValidCount < 30) {
  throw new Error("FullSpectrum smoke did not prove 30-source aggregate usage");
}
console.log("smoke:division-synthesis passed");

function section(text: string, heading: string): string {
  const marker = text.search(new RegExp(heading, "i"));
  if (marker < 0) return "";
  const rest = text.slice(marker);
  const next = rest.slice(heading.length).search(/\n#{1,3}\s+/);
  return next < 0 ? rest : rest.slice(0, heading.length + next);
}
