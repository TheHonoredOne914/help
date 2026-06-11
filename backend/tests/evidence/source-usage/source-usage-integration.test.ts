import test from "node:test";
import assert from "node:assert/strict";
import { buildClaimLedger } from "../../../src/core/evidence/claim-ledger.js";
import { syncModelRoleOutputWithValidation, validateSourceUsageMap } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("full source usage validation drops ungrounded items before claim-ledger handoff", () => {
  const { contract, registry } = makeRegistry([
    source(1, {
      fullText: "The Election Commission published voter turnout data for parliamentary accountability.",
      keyFacts: ["The Election Commission published voter turnout data for parliamentary accountability."],
      topChunks: [{ text: "The Election Commission published voter turnout data for parliamentary accountability.", score: 91, chunkIndex: 1 }],
    }),
    source(2, {
      fullText: "This source only describes committee procedure.",
      keyFacts: ["This source only describes committee procedure."],
      topChunks: [{ text: "This source only describes committee procedure.", score: 75, chunkIndex: 0 }],
    }),
  ], 1);
  const output = {
    roleName: "evidence_extractor",
    requiredSourceCount: 1,
    receivedSourceIds: [1, 2],
    usedSourceIds: [1, 2],
    unusedSourceIds: [],
    sourceUsageMap: [
      { sourceId: 1, title: "Source 1", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "Election Commission published voter turnout data for parliamentary accountability", confidence: "medium" },
      { sourceId: 2, title: "Source 2", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "Cabinet secretly amended Article 370 through a finance bill", confidence: "high" },
    ],
    sourceUsageCount: 2,
    sourceUsageRequirementSatisfied: true,
    output: {},
  } as const;

  const validation = validateSourceUsageMap(output, registry, contract, 1);
  const synced = syncModelRoleOutputWithValidation(output, validation);
  const ledger = buildClaimLedger([synced], registry);

  assert.deepEqual(validation.usedSourceIds, [1]);
  assert.equal(synced.sourceUsageMap.some((item) => item.sourceId === 2), false);
  assert.equal(ledger.summary.sourceCount, 1);
  assert.equal(ledger.items[0]?.sourceId, 1);
});
