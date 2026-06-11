import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "./evidence-registry.js";

export interface SourceGapReport {
  requiredUniqueSources: number;
  availableCitationEligibleSources: number;
  failedBuckets: string[];
  weakBuckets: string[];
  attemptedQueries: string[];
  providerErrors: string[];
  enrichmentFailures: string[];
  filterRejections: SourceFilterRejectionDiagnostic[];
  explanation: string;
  repairAttempted: boolean;
}

export interface SourceFilterRejectionDiagnostic {
  reason: string;
  detail: string;
  title?: string;
  url?: string;
}

export function buildSourceGapReport(
  contract: AgendaContract,
  registry: EvidenceRegistryCore,
  attemptedQueries: string[],
  providerErrors: string[] = [],
  enrichmentFailures: string[] = [],
  filterRejections: SourceFilterRejectionDiagnostic[] = [],
): SourceGapReport | null {
  if (registry.getCitationEligibleCount() >= contract.minimumUniqueCitedSources) return null;
  const coverage = registry.getBucketCoverage();
  const failedBuckets = contract.requiredSourceBuckets
    .map((bucket) => bucket.bucketId)
    .filter((bucketId) => !coverage[bucketId]);
  const weakBuckets = contract.requiredSourceBuckets
    .map((bucket) => bucket.bucketId)
    .filter((bucketId) => (coverage[bucketId] ?? 0) > 0 && (coverage[bucketId] ?? 0) < 2);

  return {
    requiredUniqueSources: contract.minimumUniqueCitedSources,
    availableCitationEligibleSources: registry.getCitationEligibleCount(),
    failedBuckets,
    weakBuckets,
    attemptedQueries,
    providerErrors,
    enrichmentFailures,
    filterRejections,
    explanation: `Fewer than ${contract.minimumUniqueCitedSources} citation-eligible sources were available after filtering.`,
    repairAttempted: false,
  };
}
