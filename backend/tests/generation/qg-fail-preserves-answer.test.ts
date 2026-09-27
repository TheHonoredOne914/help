import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { createQualityGateHarnessFixture } from "../quality-gate/harness/fixtures.js";

test("Fast Research with 18 eligible sources and no model cites still returns a cited brief", async () => {
  const { contract, registry, claimGraph, claimLedger, role } = createQualityGateHarnessFixture({
    mode: "fast_research",
    sourceCount: 18,
  });
  const evidencePacks = Object.values(buildEvidencePacks(registry, contract));
  const providerRouter = {
    hasProvider: () => true,
    getRegisteredProviderNames: () => ["groq"],
    complete: async () => ({
      content: "# Executive Thesis\nIndia should regulate AI political ads before the next Lok Sabha election because provenance labeling is a parliamentary, not a UN, question.",
      model: "mock",
      provider: "groq",
    }),
  };

  const result = await generateCoreResearchAnswer({
    requestId: "fast-0-cite-preserve",
    userQuery: contract.originalUserQuery,
    mode: "fast_research",
    agendaContract: contract,
    evidenceRegistry: registry,
    evidencePacks,
    claimGraph,
    claimLedger,
    sourceUsageMaps: [role],
    sourceGapReport: {
      explanation: "Only 18 citation-eligible sources retrieved against a Fast floor of 40.",
      requiredUniqueSources: 40,
      availableCitationEligibleSources: 18,
      failedBuckets: [],
      weakBuckets: [],
      attemptedQueries: [],
      providerErrors: [],
      enrichmentFailures: [],
      repairAttempted: false,
    },
    generationMode: "model",
    providerRouter: providerRouter as any,
    providerName: "groq",
    model: "mock",
    trustRegisteredProvidersWithoutStatus: true,
    allowSyntheticSourceUsage: false,
  });

  assert.ok(result.finalAnswer.trim().length > 0, "QG fail must not discard the brief");
  assert.ok(result.uniqueCitedSourceCount > 0, "eligible sources must be forced into a citation ledger");
  assert.match(result.finalAnswer, /\[Source\s+\d+\]\(/i);
});
