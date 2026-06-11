import test from "node:test";
import assert from "node:assert/strict";
import { validateSourceUsageMap } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("validator emits structured failures while preserving string failures", () => {
  const { contract, registry } = makeRegistry([source(1)], 1);
  const report = validateSourceUsageMap({
    roleName: "citation_auditor",
    requiredSourceCount: 1,
    receivedSourceIds: [1],
    usedSourceIds: [999],
    unusedSourceIds: [],
    sourceUsageMap: [{
      sourceId: 999,
      title: "Fake",
      bucketIds: ["policy_research"],
      sourceClass: "policy_research",
      usageType: "fact_extracted",
      extractedClaim: "Fake claim",
      confidence: "high",
    }],
    sourceUsageCount: 1,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 1);

  assert.equal(report.passed, false);
  assert.equal(report.structuredFailures[0]?.type, "fake_source_id");
  assert.equal(report.structuredFailures[0]?.roleName, "citation_auditor");
  assert.equal(report.structuredFailures[0]?.severity, "error");
  assert.match(report.failures.join("\n"), /fake source id 999/i);
});
