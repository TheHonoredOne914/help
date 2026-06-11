import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildClaimGraph } from "../../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { buildSourceUsageMapFromRegistry } from "../../src/core/evidence/source-usage-map.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

test("model-backed core answer path calls provider and validates registry citations", async () => {
  const agendaContract = buildAgendaContract({ requestId: "model-backed-core", originalUserQuery: "India democratic space 2022-2025 Freedom House V-Dem ECI Supreme Court RSF", outputDepth: "deep_research" });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  const citations = evidenceRegistry.getCitationEligibleSources().slice(0, 30).map((source) => evidenceRegistry.getCitationMarkdown(source.id)).join(" ");
  let called = false;
  const providerRouter = {
    complete: async () => {
      called = true;
      return {
        provider: "gemini",
        model: "test",
        content: `# Executive Thesis\nIndian Mock Parliament thesis with Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, central contradiction and strategic synthesis. ${citations}\n\n## Methodology and Source Base\nSources are cited properly.\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench and Opposition material.\nAmendment: Clause: 1.\n\n## Final Strategic Synthesis\nDiagnose the central contradiction and strategy.\nDiagnosis: test. Prescription: test. Warning: test.`,
      };
    },
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "model-backed-core",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildSourceUsageMapFromRegistry("evidence_extractor", evidenceRegistry, agendaContract, 30)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
  });

  assert.equal(called, true);
  assert.ok(result.uniqueCitedSourceCount >= 30);
  assert.equal(result.usedLegacyFallback, false);
});

test("core answer repair pass reports changed when targeted repair modifies text", async () => {
  const agendaContract = buildAgendaContract({ requestId: "model-repair-change", originalUserQuery: "India democratic space 2022-2025 ECI Supreme Court", outputDepth: "deep_research" });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  const citations = evidenceRegistry.getCitationEligibleSources().slice(0, 30).map((source) => evidenceRegistry.getCitationMarkdown(source.id)).join(" ");
  const providerRouter = {
    complete: async () => ({
      provider: "gemini",
      model: "test",
      content: `# Executive Thesis\nIndian Mock Parliament thesis with Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, central contradiction and strategic synthesis. EVMs were hacked. ${citations}\n\n## Methodology and Source Base\nSources are cited properly.\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench and Opposition material.\nAmendment: Clause: 1.\n\n## Final Strategic Synthesis\nDiagnose the central contradiction and strategy.\nDiagnosis: test. Prescription: test. Warning: test.`,
    }),
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "model-repair-change",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildSourceUsageMapFromRegistry("evidence_extractor", evidenceRegistry, agendaContract, 20)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
  });

  assert.equal(result.repairPasses.some((pass) => pass.type === "electoral_caution_repair" && pass.changed), true);
  assert.doesNotMatch(result.finalAnswer, /(?<!allegations of )EVMs were hacked/i);
  assert.match(result.finalAnswer, /allegations of evms were hacked/i);
});
