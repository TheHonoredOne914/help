import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRepairConvergence } from "../../src/core/quality-gate/repair-convergence-gate.js";

test("repair that trades one failure for another is rejected", () => {
  const before = {
    passed: false,
    score: 78,
    automaticFailures: ["D7"],
    warnings: ["thin"],
    fatalIssues: [],
    repairRequiredIssues: ["D7"],
    categoryScores: {},
    warningIssues: ["thin"],
    repairRequired: true,
  };
  const after = {
    passed: false,
    score: 79,
    automaticFailures: ["D11"],
    warnings: ["thin"],
    fatalIssues: ["template_or_thin_d11"],
    repairRequiredIssues: ["D11"],
    categoryScores: {},
    warningIssues: ["thin"],
    repairRequired: true,
  };
  const report = evaluateRepairConvergence({ beforeReport: before, afterReport: after, previousText: "old", repairedText: "new text" });
  assert.equal(report.accepted, false);
  assert.ok(report.reasons.some((reason) => /issue count did not decrease|new fatal issues/i.test(reason)));
});

test("repair that reduces issues without introducing fatals is accepted", () => {
  const before = {
    passed: false,
    score: 78,
    automaticFailures: ["D7", "D11"],
    warnings: ["thin"],
    fatalIssues: [],
    repairRequiredIssues: ["D7", "D11"],
    categoryScores: {},
    warningIssues: ["thin"],
    repairRequired: true,
  };
  const after = {
    passed: false,
    score: 80,
    automaticFailures: ["D11"],
    warnings: ["thin"],
    fatalIssues: [],
    repairRequiredIssues: ["D11"],
    categoryScores: {},
    warningIssues: ["thin"],
    repairRequired: true,
  };
  const report = evaluateRepairConvergence({ beforeReport: before, afterReport: after, previousText: "old", repairedText: "new text" });
  assert.equal(report.accepted, true);
});
