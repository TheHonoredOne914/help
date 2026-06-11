import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildClaimGraph } from "../../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { buildCoreAnswerUserPrompt } from "../../src/core/generation/core-answer-prompt.js";
import { buildSourceUsageMapFromRegistry } from "../../src/core/evidence/source-usage-map.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

function setup() {
  const agendaContract = buildAgendaContract({ requestId: "model-gen", originalUserQuery: "India democratic space 2022-2025 Freedom House V-Dem ECI Supreme Court RSF" });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  return { agendaContract, evidenceRegistry, evidencePacks, claimGraph };
}

test("model path calls provider router and validates registry citations", async () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  let called = false;
  const ids = evidenceRegistry.getCitationEligibleSources().slice(0, 30).map((source) => source.id);
  const citations = ids.map((id) => evidenceRegistry.getCitationMarkdown(id)).join(" ");
  const providerRouter = {
    complete: async (_provider: string, request: any) => {
      called = true;
      assert.equal(request.roleName, "core_answer_generator");
      return {
        provider: "gemini",
        model: "test",
        content: `# Executive Thesis\nIndian Mock Parliament thesis with Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, central contradiction and strategic synthesis. ${citations}\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench arguments and Opposition arguments.\n\n## Methodology and Source Base\nSources are cited properly.\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench arguments and Opposition arguments.\nAmendment: Clause: 1.\n\n## Final Strategic Synthesis\nDo not summarize; diagnose strategy.\nDiagnosis: test. Prescription: test. Warning: test.`,
      };
    },
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "model-path",
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
    model: "test-model",
  });

  assert.equal(called, true);
  assert.ok(result.uniqueCitedSourceCount >= 30);
});

test("fake citations and UN-style model answer are replaced by cited deterministic fallback", async () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const providerRouter = {
    complete: async () => ({
      provider: "gemini",
      model: "test",
      content: "# Executive Thesis\nMember states in the international community should pass a UN resolution [Source 999](https://fake.example).",
    }),
  } as unknown as ProviderRouter;

  const result = await generateCoreResearchAnswer({
    requestId: "bad-model-path",
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
    model: "test-model",
  });

  assert.equal(result.deterministicCitedFallbackUsed, true);
  assert.ok(result.uniqueCitedSourceCount >= 30);
  assert.doesNotMatch(result.finalAnswer, /Member states|UN resolution|international community/i);
});

test("core answer prompt includes EvidenceRegistry source contract and SourceGapReport", () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const prompt = buildCoreAnswerUserPrompt({
    requestId: "prompt",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildSourceUsageMapFromRegistry("evidence_extractor", evidenceRegistry, agendaContract, 30)],
    sourceGapReport: {
      requiredUniqueSources: 30,
      availableCitationEligibleSources: 12,
      failedBuckets: ["court_legal"],
      weakBuckets: [],
      attemptedQueries: ["India court"],
      providerErrors: [],
      enrichmentFailures: [],
      explanation: "limited sources",
      repairAttempted: false,
    },
  });

  assert.match(prompt, /EvidenceRegistry/i);
  assert.match(prompt, /SourceGapReport/i);
  assert.match(prompt, /\[Source 1\]/);
});

test("deterministic generation uses agenda framing instead of hardcoded democracy-space thesis", async () => {
  const agendaContract = buildAgendaContract({
    requestId: "gst-agenda",
    originalUserQuery: "AIPPM debate on GST compensation, fiscal federalism, and Union-state accountability",
  });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);

  const result = await generateCoreResearchAnswer({
    requestId: "gst-deterministic",
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildSourceUsageMapFromRegistry("evidence_extractor", evidenceRegistry, agendaContract, 20)],
    allowSyntheticSourceUsage: true,
    generationMode: "deterministic",
  });

  assert.match(result.finalAnswer, /GST compensation|fiscal federalism|Union-state accountability/i);
});
