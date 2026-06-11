import test from "node:test";
import assert from "node:assert/strict";
import { createResearchEvalRecord } from "../../src/services/research-eval.js";

test("research eval records core/fallback usage and redacts provider errors", () => {
  const record = createResearchEvalRecord({
    requestId: "eval-1",
    mode: "deep_research",
    agendaType: "indian_democratic_space",
    committeeType: "aippm",
    latencyMs: 1234,
    usedCoreGeneration: true,
    usedLegacyFallback: false,
    totalQueries: 80,
    rawResults: 300,
    enrichedSources: 80,
    evidenceRegistrySources: 60,
    citationEligibleSources: 50,
    finalUniqueCitedSources: 30,
    sourceBucketsCovered: 10,
    divisionsGenerated: 11,
    divisionsRepaired: [],
    qualityGateScore: 92,
    sourceUsageContractPassed: true,
    archiveRoutingAction: "attach_to_workspace",
    researchAnglesGenerated: 8,
    cacheHits: 3,
    cacheMisses: 4,
    modelCalls: 5,
    providerErrors: ["Authorization Bearer sk-or-v1-secret"],
  });

  assert.equal(record.usedCoreGeneration, true);
  assert.doesNotMatch(record.providerErrors.join("\n"), /sk-or-v1-secret/);
  assert.match(record.providerErrors.join("\n"), /REDACTED/);
});
