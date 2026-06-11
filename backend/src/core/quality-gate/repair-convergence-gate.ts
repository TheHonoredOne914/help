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
  const scoreImproved = input.afterReport.score > input.beforeReport.score;
  const issuesReduced = afterIssueCount < beforeIssueCount;
  const fatalReduced = (input.afterReport.fatalIssues ?? []).length < (input.beforeReport.fatalIssues ?? []).length;
  const accepted = changed && (scoreImproved || issuesReduced || fatalReduced) && input.afterReport.score >= input.beforeReport.score - 3;
  const reasons: string[] = [];
  if (!changed) reasons.push("text did not change");
  if (!scoreImproved && !issuesReduced && !fatalReduced) reasons.push("no quality improvement");
  if (input.afterReport.score < input.beforeReport.score - 3) reasons.push("quality got worse");
  if (accepted) reasons.push("quality improved");
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
