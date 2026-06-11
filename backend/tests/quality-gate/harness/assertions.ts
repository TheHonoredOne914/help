import assert from "node:assert/strict";
import type { QualityGateReport } from "../../../src/core/verification/thesis-quality-gate.js";

export function expectGateFail(report: QualityGateReport, bugId: string): void {
  assert.equal(report.passed, false, `${bugId} expected gate failure`);
}

export function expectGatePass(report: QualityGateReport): void {
  assert.equal(report.passed, true, `expected gate pass, issues: ${(report.automaticFailures ?? []).join("; ")}`);
}

export function expectFatalIssue(report: QualityGateReport, issueCode: string): void {
  assert.ok(
    (report.fatalIssues ?? []).some((issue) => issue.includes(issueCode)),
    `expected fatal issue ${issueCode}, got: ${(report.fatalIssues ?? []).join("; ")}`,
  );
}

export function expectRepairIssue(report: QualityGateReport, issueCode: string): void {
  assert.ok(
    (report.repairRequiredIssues ?? []).some((issue) => issue.includes(issueCode)),
    `expected repair issue ${issueCode}, got: ${(report.repairRequiredIssues ?? []).join("; ")}`,
  );
}

export function expectDivisionFail(report: QualityGateReport, divisionId: string): void {
  assert.ok(
    [...(report.fatalIssues ?? []), ...(report.repairRequiredIssues ?? [])].some((issue) => issue.includes(divisionId)),
    `expected division ${divisionId} failure, got: ${(report.automaticFailures ?? []).join("; ")}`,
  );
}

export function expectTelemetry(report: QualityGateReport): void {
  assert.ok((report as any).telemetry, "expected quality telemetry payload");
  assert.equal(typeof (report as any).telemetry.overallScore, "number");
}
