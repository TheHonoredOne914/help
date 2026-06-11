import type { SourceGapReport } from "../../evidence/source-gap-report.js";

export function buildSourceGapRoleContext(roleName: string, report?: SourceGapReport | null): string {
  if (!report) return "SourceGapReport Context: none";
  const criticLine = /retrieval_critic|citation_auditor|final_quality/i.test(roleName)
    ? "Audit missing buckets, weak source classes, overrepresented domains, low citation strength, and insufficient full-text evidence."
    : "Use this only to qualify claims and avoid filling source gaps with assumptions.";
  return [
    "SourceGapReport Context:",
    `Required unique sources: ${report.requiredUniqueSources}`,
    `Available citation-eligible sources: ${report.availableCitationEligibleSources}`,
    `Missing buckets: ${report.failedBuckets.join(", ") || "none"}`,
    `Weak buckets: ${report.weakBuckets.join(", ") || "none"}`,
    `Attempted queries: ${report.attemptedQueries.slice(0, 8).join(" | ") || "none"}`,
    `Provider errors: ${report.providerErrors.length}`,
    `Enrichment failures: ${report.enrichmentFailures.length}`,
    `Explanation: ${report.explanation}`,
    criticLine,
  ].join("\n");
}
