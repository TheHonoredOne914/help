import test from "node:test";
import assert from "node:assert/strict";
import { buildClaimLedger } from "../../../src/core/evidence/claim-ledger.js";
import type { ModelRoleOutput } from "../../../src/core/evidence/source-usage-map.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-14 deterministic ClaimLedger gives citation credit to valid strong evidence despite low model confidence", () => {
  const contract = testContract("Article 19 voter information");
  const registry = registryWith([testSource({
    title: "Supreme Court Article 19 holding",
    url: "https://sci.gov.in/source-1",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    keyFacts: ["The Supreme Court linked voter information to Article 19."],
    topChunks: [{ text: "The Supreme Court linked voter information to Article 19.", score: 10, chunkIndex: 0 }],
    citationStrength: "strong",
    extractionQuality: "full",
    limitedSource: false,
  })], contract);
  const output: ModelRoleOutput = {
    roleName: "evidence_extractor",
    minimumSourceRequirement: 1,
    requiredSourceCount: 1,
    receivedSourceIds: [1],
    usedSourceIds: [1],
    unusedSourceIds: [],
    sourceUsageMap: [{
      sourceId: 1,
      title: "Supreme Court Article 19 holding",
      bucketIds: ["court_legal"],
      sourceClass: "court_primary",
      usageType: "fact_extracted",
      extractedClaim: "The Supreme Court linked voter information to Article 19.",
      confidence: "low",
    }],
    sourceUsageCount: 1,
    sourceUsageRequirementSatisfied: true,
    output: {},
  };

  const ledger = buildClaimLedger([output], registry);

  assert.equal(ledger.summary.citationCreditEligibleCount, 1);
});
