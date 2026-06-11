import { evaluateRepairConvergence } from "./repair-convergence-gate.js";
import type { QualityGateReport } from "./types.js";

export interface PostRepairValidationInput {
  beforeReport: QualityGateReport;
  afterReport: QualityGateReport;
  previousText: string;
  repairedText: string;
}

export interface PostRepairValidationReport {
  accepted: boolean;
  changed: boolean;
  reasons: string[];
  beforeScore: number;
  afterScore: number;
  beforeIssueCount: number;
  afterIssueCount: number;
}

export function runPostRepairValidation(input: PostRepairValidationInput): PostRepairValidationReport {
  return evaluateRepairConvergence(input);
}
