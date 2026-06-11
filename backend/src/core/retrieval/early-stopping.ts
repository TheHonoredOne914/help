import type { ResearchMode } from "../config/research-mode.js";

export interface EarlyStoppingInput {
  mode: ResearchMode;
  citationEligibleSources: number;
  coveredBucketIds: string[];
  finalCitationsRealistic: boolean;
  criticalMissingBucketIds: string[];
}

export interface EarlyStoppingResult {
  stop: boolean;
  reason: string;
}

const TARGETS: Record<ResearchMode, { minEligible: number; minBuckets: number }> = {
  fast_research: { minEligible: 20, minBuckets: 5 },
  deep_research: { minEligible: 80, minBuckets: 7 },
  council: { minEligible: 180, minBuckets: 8 },
};

export function shouldStopRetrievalEarly(input: EarlyStoppingInput): EarlyStoppingResult {
  const target = TARGETS[input.mode];
  const buckets = new Set(input.coveredBucketIds.filter(Boolean));
  if (input.criticalMissingBucketIds.length > 0) {
    return { stop: false, reason: `Critical bucket missing: ${input.criticalMissingBucketIds.join(", ")}` };
  }
  if (!input.finalCitationsRealistic) {
    return { stop: false, reason: "Final citation target is not realistic yet." };
  }
  if (input.citationEligibleSources < target.minEligible) {
    return { stop: false, reason: `Need ${target.minEligible} citation-eligible sources; have ${input.citationEligibleSources}.` };
  }
  if (buckets.size < target.minBuckets) {
    return { stop: false, reason: `Need ${target.minBuckets} covered source buckets; have ${buckets.size}.` };
  }
  return { stop: true, reason: `${input.mode} source target satisfied.` };
}
