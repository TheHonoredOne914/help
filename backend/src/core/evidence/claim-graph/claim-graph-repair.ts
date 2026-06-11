import type { UnsupportedClaimIssue } from "./types.js";

export function hardUnsupportedIssues(issues: UnsupportedClaimIssue[]): UnsupportedClaimIssue[] {
  return issues.filter((issue) => issue.action === "hard_fail");
}
