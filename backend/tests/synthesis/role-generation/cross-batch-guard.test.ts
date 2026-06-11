import test from "node:test";
import assert from "node:assert/strict";
import { filterOutOfBatchUsageItems } from "../../../src/core/synthesis/role-generation/cross-batch-guard.js";

test("cross-batch guard rejects source ids outside the assigned batch", () => {
  const result = filterOutOfBatchUsageItems("evidence_extractor", [
    { sourceId: 1, title: "A", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "A", confidence: "medium" },
    { sourceId: 99, title: "B", bucketIds: [], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "B", confidence: "medium" },
  ], new Set([1]));

  assert.deepEqual(result.accepted.map((item) => item.sourceId), [1]);
  assert.deepEqual(result.rejectedSourceIds, [99]);
  assert.match(result.warning ?? "", /cross-batch/i);
});
