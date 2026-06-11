import test from "node:test";
import assert from "node:assert/strict";
import { syncModelRoleOutputWithValidation, validateSourceUsageMap } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("usedSourceIds are synchronized to validator-approved IDs", () => {
  const { contract, registry } = makeRegistry([
    source(1, { fullText: "Source 1 proves Article 14 proportionality accountability.", keyFacts: ["Source 1 proves Article 14 proportionality accountability."] }),
    source(2, { fullText: "Source 2 was not assigned to this role.", keyFacts: ["Source 2 was not assigned to this role."] }),
  ], 1);
  const output = {
    roleName: "evidence_extractor",
    requiredSourceCount: 1,
    receivedSourceIds: [1],
    usedSourceIds: [1, 2, 999],
    unusedSourceIds: [],
    sourceUsageMap: [
      { sourceId: 1, title: "Source 1", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "Source 1 proves Article 14 proportionality accountability", confidence: "medium" },
      { sourceId: 2, title: "Source 2", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "Source 2 was not assigned to this role", confidence: "medium" },
      { sourceId: 999, title: "Fake", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "Fake claim", confidence: "medium" },
    ],
    sourceUsageCount: 3,
    sourceUsageRequirementSatisfied: true,
    output: {},
  } as const;

  const validation = validateSourceUsageMap(output, registry, contract, 1);
  const synced = syncModelRoleOutputWithValidation(output, validation);

  assert.deepEqual(validation.usedSourceIds, [1]);
  assert.deepEqual(synced.usedSourceIds, [1]);
  assert.deepEqual(synced.unusedSourceIds, []);
  assert.equal(synced.output.validation.rejectedSourceIds.includes(2), true);
  assert.equal(synced.output.validation.rejectedSourceIds.includes(999), true);
});
