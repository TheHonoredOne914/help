import type { GateResult, QualityGateRuntimeInput } from "./types.js";
import type { ModeQualityThresholds } from "./mode-thresholds.js";

export function runSourceDiversityGate(ctx: QualityGateRuntimeInput, thresholds: ModeQualityThresholds): GateResult {
  const issues = [];
  const citedSources = ctx.input.uniqueCitedSourceIds.map((id) => ctx.registry.getSource(id)).filter(Boolean);
  const classSet = new Set(citedSources.map((source) => source!.sourceClass));
  const bucketSet = new Set(ctx.input.citedBucketIds);
  const citedCount = ctx.input.uniqueCitedSourceIds.length;
  const weakCount = citedSources.filter((source) => source!.citationStrength === "weak" || source!.citationStrength === "ineligible").length;
  const snippetCount = citedSources.filter((source) => source!.extractionQuality === "snippet" || source!.limitedSource).length;
  const bucketCounts = new Map<string, number>();
  for (const source of citedSources) for (const bucket of source!.bucketIds) bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  const largestBucket = Math.max(0, ...bucketCounts.values());
  const snippetRatio = citedCount ? snippetCount / citedCount : 1;
  const weakRatio = citedCount ? weakCount / citedCount : 1;
  const concentrationRatio = citedCount ? largestBucket / citedCount : 1;
  const sourceGapRatio = thresholds.minCitedSources > 0 ? citedCount / thresholds.minCitedSources : 1;
  const allowCitationCountGapWarning =
    Boolean(ctx.input.sourceGapReport)
    && (ctx.input.mode === "fast_research" || ctx.input.mode === "deep_research")
    && sourceGapRatio >= 0.75;

  if (citedCount < thresholds.minCitedSources) {
    issues.push({
      code: "mode_depth",
      message: `mode_depth: ${citedCount} cited sources below mode minimum ${thresholds.minCitedSources}`,
      severity: allowCitationCountGapWarning ? "warning" as const : "fatal" as const,
    });
  }
  if (classSet.size < thresholds.minSourceClasses) {
    issues.push({ code: "source_class_diversity", message: `source_class_diversity: ${classSet.size} classes below ${thresholds.minSourceClasses}`, severity: "repair" as const });
  }
  if (bucketSet.size < thresholds.minBuckets) {
    const message = bucketSet.size <= 2 && citedCount >= thresholds.minCitedSources
      ? "citations concentrated in only 1-2 buckets"
      : `bucket_concentration: ${bucketSet.size} buckets below ${thresholds.minBuckets}`;
    issues.push({
      code: "bucket_concentration",
      message,
      severity: "fatal" as const,
    });
  }
  if (snippetRatio > thresholds.maxSnippetRatio || weakRatio > thresholds.maxWeakRatio) {
    issues.push({
      code: "source_quality",
      message: "source_quality: weak or snippet-only source ratio is too high",
      severity: "fatal" as const,
    });
  }
  if (concentrationRatio > thresholds.maxBucketConcentrationRatio && citedCount >= thresholds.minCitedSources) {
    issues.push({
      code: "bucket_concentration",
      message: "bucket_concentration: one bucket dominates cited evidence",
      severity: "fatal" as const,
    });
  }

  const score = Math.max(0, 20
    - Math.max(0, thresholds.minCitedSources - citedCount)
    - Math.max(0, thresholds.minSourceClasses - classSet.size) * 2
    - Math.max(0, thresholds.minBuckets - bucketSet.size) * 2
    - Math.round(snippetRatio * 6)
    - Math.round(weakRatio * 6));
  return {
    score: Math.min(20, score),
    maxScore: 20,
    issues,
    metrics: {
      citedCount,
      sourceClassCount: classSet.size,
      bucketCount: bucketSet.size,
      snippetRatio,
      weakRatio,
      concentrationRatio,
    },
    categoryScores: {
      sourceBucketCoverage: Math.min(15, bucketSet.size >= thresholds.minBuckets ? 15 : bucketSet.size),
      sourceContract: citedCount >= thresholds.minCitedSources ? 15 : 0,
    },
  };
}
