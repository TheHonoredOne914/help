import test from "node:test";
import assert from "node:assert/strict";
import { validateSourceUsageMap } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("validator rejects source IDs outside the role batch scope", () => {
  const { contract, registry } = makeRegistry([
    source(1, { fullText: "Source one proves Article 14 proportionality accountability.", keyFacts: ["Source one proves Article 14 proportionality accountability."] }),
    source(2, { fullText: "Source two is real but was not assigned to this role.", keyFacts: ["Source two is real but was not assigned to this role."] }),
  ], 1);

  const report = validateSourceUsageMap({
    roleName: "evidence_extractor",
    requiredSourceCount: 1,
    receivedSourceIds: [1],
    usedSourceIds: [1, 2],
    unusedSourceIds: [],
    sourceUsageMap: [
      {
        sourceId: 1,
        title: "Source 1",
        bucketIds: ["policy_research"],
        sourceClass: "policy_research",
        usageType: "fact_extracted",
        extractedClaim: "Source one proves Article 14 proportionality accountability",
        confidence: "medium",
      },
      {
        sourceId: 2,
        title: "Source 2",
        bucketIds: ["policy_research"],
        sourceClass: "policy_research",
        usageType: "fact_extracted",
        extractedClaim: "Source two is real but was not assigned to this role",
        confidence: "medium",
      },
    ],
    sourceUsageCount: 2,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 1);

  assert.equal(report.passed, false);
  assert.deepEqual(report.usedSourceIds, [1]);
  assert.deepEqual(report.rejectedSourceIds, [2]);
  assert.equal(report.structuredFailures.some((failure) => failure.type === "cross_batch_reference" && failure.sourceId === 2), true);
});

test("validator treats an explicit empty role batch as no assigned sources", () => {
  const { contract, registry } = makeRegistry([
    source(1, { fullText: "Source one proves Article 14 proportionality accountability.", keyFacts: ["Source one proves Article 14 proportionality accountability."] }),
  ], 1);

  const report = validateSourceUsageMap({
    roleName: "evidence_extractor",
    requiredSourceCount: 1,
    receivedSourceIds: [],
    usedSourceIds: [1],
    unusedSourceIds: [],
    sourceUsageMap: [
      {
        sourceId: 1,
        title: "Source 1",
        bucketIds: ["policy_research"],
        sourceClass: "policy_research",
        usageType: "fact_extracted",
        extractedClaim: "Source one proves Article 14 proportionality accountability",
        confidence: "medium",
      },
    ],
    sourceUsageCount: 1,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 1);

  assert.equal(report.passed, false);
  assert.deepEqual(report.usedSourceIds, []);
  assert.deepEqual(report.rejectedSourceIds, [1]);
  assert.equal(report.structuredFailures.some((failure) => failure.type === "cross_batch_reference" && failure.sourceId === 1), true);
});
