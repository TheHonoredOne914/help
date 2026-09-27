import type { ResearchMode } from "../config/research-mode.js";

export interface EvidenceScoreSource {
  bucketIds?: string[];
  extractionQuality?: "full" | "partial" | "snippet" | "failed" | string;
  citationEligible?: boolean;
  limitedSource?: boolean;
}

export interface EarlyStoppingInput {
  mode: ResearchMode;
  /** @deprecated Prefer evidenceScore; kept for callers still passing raw counts. */
  citationEligibleSources?: number;
  evidenceScore?: number;
  evidenceSources?: EvidenceScoreSource[];
  coveredBucketIds: string[];
  finalCitationsRealistic: boolean;
  criticalMissingBucketIds: string[];
}

export interface EarlyStoppingResult {
  stop: boolean;
  reason: string;
}

const TARGETS: Record<ResearchMode, { minEligible: number; minBuckets: number }> = {
  fast_research: { minEligible: 40, minBuckets: 5 },
  deep_research: { minEligible: 45, minBuckets: 7 },
  council: { minEligible: 110, minBuckets: 8 },
};

const BUCKET_SCORE_CAP_RATIO = 0.25;

/** full=1.0, limited/partial/weak-snippet=0.35, unknown/missing=0.5, failed/ineligible-snippet=0 */
export function weightForEvidenceSource(source: EvidenceScoreSource): number {
  if (source.extractionQuality === "failed") return 0;
  if (source.extractionQuality === "snippet") {
    return source.citationEligible ? 0.35 : 0;
  }
  if (source.extractionQuality === "full" && source.citationEligible && !source.limitedSource) return 1.0;
  if (source.extractionQuality === "partial" || source.limitedSource) return 0.35;
  if (source.citationEligible && source.extractionQuality === "full") return 1.0;
  // Search rows are scored before enrichment, while extraction quality is still unknown.
  if (source.extractionQuality == null || source.extractionQuality === "" || source.extractionQuality === "unknown") return 0.5;
  return 0;
}

/**
 * Quality-weighted evidence score with per-bucket cap (~25% of mode target)
 * so a single bucket cannot alone satisfy early-stop.
 */
export function computeEvidenceScore(
  sources: EvidenceScoreSource[],
  options: { targetScore?: number } = {},
): number {
  const byBucket = new Map<string, number>();
  for (const source of sources) {
    const weight = weightForEvidenceSource(source);
    if (weight <= 0) continue;
    const buckets = source.bucketIds?.filter(Boolean).length ? source.bucketIds.filter(Boolean) : ["_unbucketed"];
    const share = weight / buckets.length;
    for (const bucket of buckets) {
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + share);
    }
  }
  const rawTotal = [...byBucket.values()].reduce((sum, value) => sum + value, 0);
  if (rawTotal <= 0) return 0;
  const capBase = options.targetScore ?? rawTotal;
  const cap = Math.max(1, capBase * BUCKET_SCORE_CAP_RATIO);
  let capped = 0;
  for (const score of byBucket.values()) {
    capped += Math.min(score, cap);
  }
  return capped;
}

export function earlyStopTarget(mode: ResearchMode): { minEligible: number; minBuckets: number } {
  return TARGETS[mode];
}

export function shouldStopRetrievalEarly(input: EarlyStoppingInput): EarlyStoppingResult {
  const target = TARGETS[input.mode];
  const buckets = new Set(input.coveredBucketIds.filter(Boolean));
  if (input.criticalMissingBucketIds.length > 0) {
    return { stop: false, reason: `Critical bucket missing: ${input.criticalMissingBucketIds.join(", ")}` };
  }
  if (!input.finalCitationsRealistic) {
    return { stop: false, reason: "Final citation target is not realistic yet." };
  }
  const score = input.evidenceScore
    ?? (input.evidenceSources
      ? computeEvidenceScore(input.evidenceSources, { targetScore: target.minEligible })
      : (input.citationEligibleSources ?? 0));
  if (score < target.minEligible) {
    return { stop: false, reason: `Need evidence score ${target.minEligible}; have ${Math.round(score * 10) / 10}.` };
  }
  if (buckets.size < target.minBuckets) {
    return { stop: false, reason: `Need ${target.minBuckets} covered source buckets; have ${buckets.size}.` };
  }
  return { stop: true, reason: `${input.mode} evidence score target satisfied.` };
}
