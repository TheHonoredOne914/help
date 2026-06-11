import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourceUsageItems, validateSourceUsageMap } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("unknown source usage types normalize to an invalid sentinel and fail validation", () => {
  const { contract, registry } = makeRegistry([
    source(1, { fullText: "Source one proves Article 14 proportionality accountability.", keyFacts: ["Source one proves Article 14 proportionality accountability."] }),
  ], 1);

  const sourceUsageMap = normalizeSourceUsageItems({
    sourceUsageMap: [{
      sourceId: 1,
      usageType: "cited",
      extractedClaim: "Source one proves Article 14 proportionality accountability",
      confidence: "high",
    }],
  }, [{
    sourceId: 1,
    title: "Source 1",
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    keyFacts: ["Source one proves Article 14 proportionality accountability."],
    keyNumbers: [],
    legalHoldings: [],
    limitations: [],
    debateUse: "Source one proves Article 14 proportionality accountability.",
  }]);

  assert.equal(sourceUsageMap[0]?.usageType, "unknown_invalid");

  const report = validateSourceUsageMap({
    roleName: "evidence_extractor",
    requiredSourceCount: 1,
    receivedSourceIds: [1],
    usedSourceIds: [1],
    unusedSourceIds: [],
    sourceUsageMap,
    sourceUsageCount: 1,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 1);

  assert.equal(report.passed, false);
  assert.equal(report.structuredFailures.some((failure) => failure.type === "invalid_usage_type"), true);
});
