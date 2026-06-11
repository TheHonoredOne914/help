import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSourceUsageValidation } from "../../../src/core/evidence/source-usage/aggregate-source-usage.js";
import type { ModelRoleOutput } from "../../../src/core/evidence/source-usage/index.js";
import { getSourceUsagePolicy } from "../../../src/core/config/source-usage-policy.js";
import { makeRegistry, source } from "./helpers.js";

function output(roleName: string, ids: number[], receivedSourceIds = ids): ModelRoleOutput {
  return {
    roleName,
    minimumSourceRequirement: 2,
    requiredSourceCount: 2,
    receivedSourceIds,
    usedSourceIds: ids,
    unusedSourceIds: [],
    sourceUsageMap: ids.map((sourceId) => ({
      sourceId,
      title: `Source ${sourceId}`,
      bucketIds: ["policy_research"],
      sourceClass: "policy_research",
      usageType: "fact_extracted",
      extractedClaim: `Source ${sourceId} proves Article 14 proportionality accountability`,
      confidence: "medium",
    })),
    sourceUsageCount: ids.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  };
}

test("aggregate validation exposes per-role failures instead of union-only success", () => {
  const { contract, registry } = makeRegistry([
    source(1, { fullText: "Source 1 proves Article 14 proportionality accountability.", keyFacts: ["Source 1 proves Article 14 proportionality accountability."] }),
    source(2, { fullText: "Source 2 proves Article 14 proportionality accountability.", keyFacts: ["Source 2 proves Article 14 proportionality accountability."] }),
    source(3, { fullText: "Source 3 proves Article 14 proportionality accountability.", keyFacts: ["Source 3 proves Article 14 proportionality accountability."] }),
  ], 2);

  const aggregate = aggregateSourceUsageValidation(
    [output("role_a", [1, 2], [1, 2]), output("role_b", [3], [1, 2])],
    registry,
    contract,
    getSourceUsagePolicy("deep_research"),
  );

  assert.equal(aggregate.passed, false);
  assert.equal(aggregate.perRoleValidation.length, 2);
  assert.equal(aggregate.perRoleValidation.find((role) => role.roleName === "role_b")?.passed, false);
  assert.deepEqual(aggregate.validUsedSourceIds, [1, 2]);
});
