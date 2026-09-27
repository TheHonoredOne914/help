import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { buildClaimGraph } from "../../src/core/evidence/claim-graph.js";
import { validateSourceUsageMap } from "../../src/core/evidence/source-usage-map.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";
import { buildModeSourceUsageMap } from "../helpers/source-usage-fixtures.js";
import { buildPassingResearchAnswer } from "../helpers/passing-research-answer.js";
import { RESEARCH_LIMITS } from "../../src/core/config/research-mode.js";

function setup() {
  const agendaContract = buildAgendaContract({ requestId: "usage-test", originalUserQuery: "India democratic space 2022-2025 Freedom House V-Dem EIU UAPA FCRA ECI Supreme Court press freedom" });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const packsById = buildEvidencePacks(evidenceRegistry, agendaContract);
  const evidencePacks = Object.values(packsById);
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  return { agendaContract, evidenceRegistry, evidencePacks, claimGraph };
}

test("source usage map listing without extracted or supporting usage fails", () => {
  const { agendaContract, evidenceRegistry } = setup();
  const sourceIds = Array.from({ length: 50 }, (_, index) => index + 1);
  const report = validateSourceUsageMap({
    roleName: "thesis_synthesizer",
    requiredSourceCount: 30,
    receivedSourceIds: sourceIds,
    usedSourceIds: sourceIds,
    unusedSourceIds: [],
    sourceUsageMap: sourceIds.map((sourceId) => ({
      sourceId,
      title: `Source ${sourceId}`,
      bucketIds: evidenceRegistry.getSource(sourceId)?.bucketIds ?? [],
      sourceClass: evidenceRegistry.getSource(sourceId)?.sourceClass ?? "policy_research",
      usageType: "relevant_but_weak",
      confidence: "medium",
    })),
    sourceUsageCount: 30,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, evidenceRegistry, agendaContract, 30);

  assert.equal(report.passed, false);
  assert.match(report.failures.join("\n"), /actual extraction/i);
});

test("fake source ids and legal holdings from non-legal sources fail", () => {
  const { agendaContract, evidenceRegistry } = setup();
  const firstMedia = evidenceRegistry.sources.find((source) => source.sourceClass === "indian_major_media")!;
  const report = validateSourceUsageMap({
    roleName: "legal_researcher",
    requiredSourceCount: 2,
    receivedSourceIds: [firstMedia.id, 999],
    usedSourceIds: [firstMedia.id, 999],
    unusedSourceIds: [],
    sourceUsageMap: [
      { sourceId: firstMedia.id, title: firstMedia.title, bucketIds: firstMedia.bucketIds, sourceClass: firstMedia.sourceClass, usageType: "legal_holding_extracted", legalHolding: "Held that rights require proportionality.", confidence: "high" },
      { sourceId: 999, title: "Fake", bucketIds: ["court_legal"], sourceClass: "court_primary", usageType: "supports_claim", extractedClaim: "fake", confidence: "high" },
    ],
    sourceUsageCount: 2,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, evidenceRegistry, agendaContract, 2);

  assert.equal(report.passed, false);
  assert.match(report.failures.join("\n"), /fake source id|legal_holding_extracted/i);
});

test("core generator repairs thin final source selection before generation", async () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();

  const result = await generateCoreResearchAnswer({
    requestId: "thin-citations",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildModeSourceUsageMap("deep_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter: {
      complete: async () => ({
        provider: "gemini",
        model: "test",
        content: buildPassingResearchAnswer(evidenceRegistry, "deep_research"),
      }),
    } as unknown as ProviderRouter,
    providerName: "gemini",
    model: "test-model",
    forceFinalSourceIds: Array.from({ length: 18 }, (_, index) => index + 1),
  });

  assert.equal(result.usedLegacyFallback, false);
  assert.ok(result.uniqueCitedSourceCount >= RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources);
});

test("core generator passes with 30 unique cited sources across 9 buckets", async () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const result = await generateCoreResearchAnswer({
    requestId: "strong-citations",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildModeSourceUsageMap("deep_research", "evidence_extractor", evidenceRegistry, agendaContract)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter: {
      complete: async () => ({
        provider: "gemini",
        model: "test",
        content: buildPassingResearchAnswer(evidenceRegistry, "deep_research"),
      }),
    } as unknown as ProviderRouter,
    providerName: "gemini",
    model: "test-model",
  });

  assert.equal(result.usedLegacyFallback, false);
  assert.ok(result.uniqueCitedSourceCount >= RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources);
  assert.ok(result.citationValidationReport.linkedCitationCount >= RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources);
  assert.equal(result.qualityGateReport.passed, true);
});
