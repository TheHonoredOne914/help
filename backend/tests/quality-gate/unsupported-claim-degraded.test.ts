import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { buildPassingAnswer, createQualityGateHarnessFixture } from "./harness/fixtures.js";

test("BUG-21-09: repairable unsupported claims degrade with disclosure instead of raw throw", async () => {
  const { contract, registry, input, claimGraph, claimLedger, role } = createQualityGateHarnessFixture({ mode: "fast_research", sourceCount: 10 });
  const evidencePacks = Object.values(buildEvidencePacks(registry, contract));
  const providerRouter = {
    hasProvider: () => true,
    getRegisteredProviderNames: () => ["groq"],
    complete: async () => ({
      content: `${buildPassingAnswer(registry, "fast_research")}\n\nAdditional registry citations: ${input.uniqueCitedSourceIds.map((id) => registry.getCitationMarkdown(id)).join(" ")}\n\nIndia scored 999 on a fabricated integrity score. ${registry.getCitationMarkdown(1)}`,
      model: "mock",
      provider: "groq",
    }),
  };

  const result = await generateCoreResearchAnswer({
    requestId: "bug-21-09",
    userQuery: contract.originalUserQuery,
    mode: "fast_research",
    agendaContract: contract,
    evidenceRegistry: registry,
    evidencePacks,
    claimGraph,
    claimLedger,
    sourceUsageMaps: [role],
    divisionOutputs: input.divisionOutputs as Map<string, string>,
    sourceGapReport: { explanation: "Unsupported score was qualified as a source gap.", requiredUniqueSources: 10, availableCitationEligibleSources: 10, failedBuckets: [], weakBuckets: [], attemptedQueries: [], providerErrors: [], enrichmentFailures: [], repairAttempted: true },
    generationMode: "model",
    providerRouter: providerRouter as any,
    providerName: "groq",
    model: "mock",
    trustRegisteredProvidersWithoutStatus: true,
    forceFinalSourceIds: input.uniqueCitedSourceIds,
    allowSyntheticSourceUsage: false,
  });

  assert.match(result.finalAnswer, /Source Gap Disclosure/i);
  assert.ok(result.sourceGapReport);
  assert.equal(result.usedLegacyFallback, false);
});

test("unsupported legal case labels are repaired before hard-fail decision", async () => {
  const { contract, registry, input, claimGraph, claimLedger, role } = createQualityGateHarnessFixture({ mode: "fast_research", sourceCount: 10 });
  const evidencePacks = Object.values(buildEvidencePacks(registry, contract));
  const providerRouter = {
    hasProvider: () => true,
    getRegisteredProviderNames: () => ["groq"],
    complete: async () => ({
      content: `${buildPassingAnswer(registry, "fast_research")}\n\nThe Supreme Court held in Democratic Reforms v. Union that the proposed election disclosure regime is valid. ${registry.getCitationMarkdown(1)}\n\nAdditional registry citations: ${input.uniqueCitedSourceIds.map((id) => registry.getCitationMarkdown(id)).join(" ")}`,
      model: "mock",
      provider: "groq",
    }),
  };

  const result = await generateCoreResearchAnswer({
    requestId: "bug-21-legal-repair",
    userQuery: contract.originalUserQuery,
    mode: "fast_research",
    agendaContract: contract,
    evidenceRegistry: registry,
    evidencePacks,
    claimGraph,
    claimLedger,
    sourceUsageMaps: [role],
    divisionOutputs: input.divisionOutputs as Map<string, string>,
    generationMode: "model",
    providerRouter: providerRouter as any,
    providerName: "groq",
    model: "mock",
    trustRegisteredProvidersWithoutStatus: true,
    forceFinalSourceIds: input.uniqueCitedSourceIds,
    allowSyntheticSourceUsage: false,
  });

  assert.doesNotMatch(result.finalAnswer, /Democratic Reforms v\. Union/);
  assert.ok(result.repairPasses.some((pass) => pass.type === "legal_accuracy_repair" && pass.accepted));
});
