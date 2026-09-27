import type { QualityGateReport } from "./types.js";

export interface RepairConvergenceInput {
  beforeReport: QualityGateReport;
  afterReport: QualityGateReport;
  previousText: string;
  repairedText: string;
}

export interface RepairConvergenceReport {
  accepted: boolean;
  changed: boolean;
  reasons: string[];
  beforeScore: number;
  afterScore: number;
  beforeIssueCount: number;
  afterIssueCount: number;
}

export function evaluateRepairConvergence(input: RepairConvergenceInput): RepairConvergenceReport {
  const changed = input.previousText !== input.repairedText;
  const beforeIssueCount = countIssues(input.beforeReport);
  const afterIssueCount = countIssues(input.afterReport);
  const issuesReduced = afterIssueCount < beforeIssueCount;
  const beforeFatals = input.beforeReport.fatalIssues ?? [];
  const afterFatals = input.afterReport.fatalIssues ?? [];
  const fatalIntroduced = afterFatals.some((issue) => !beforeFatals.includes(issue));
  const scoreHeld = input.afterReport.score >= input.beforeReport.score;
  const accepted = changed
    && issuesReduced
    && scoreHeld
    && !fatalIntroduced
    && afterFatals.length <= beforeFatals.length;
  const reasons: string[] = [];
  if (!changed) reasons.push("text did not change");
  if (!issuesReduced) reasons.push("issue count did not decrease");
  if (!scoreHeld) reasons.push("quality got worse");
  if (fatalIntroduced) reasons.push("repair introduced new fatal issues");
  if (accepted) reasons.push("quality improved on targeted issues");
  return {
    accepted,
    changed,
    reasons,
    beforeScore: input.beforeReport.score,
    afterScore: input.afterReport.score,
    beforeIssueCount,
    afterIssueCount,
  };
}

function countIssues(report: QualityGateReport): number {
  return (report.fatalIssues?.length ?? 0) + (report.repairRequiredIssues?.length ?? 0) + (report.warnings?.length ?? 0);
}
