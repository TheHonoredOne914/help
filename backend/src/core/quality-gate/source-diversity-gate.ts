import type { GateResult, QualityGateRuntimeInput } from "./types.js";
import type { ModeQualityThresholds } from "./mode-thresholds.js";

export function runSourceDiversityGate(ctx: QualityGateRuntimeInput, thresholds: ModeQualityThresholds): GateResult {
  const issues = [];
  const citedSources = ctx.input.uniqueCitedSourceIds.map((id) => ctx.registry.getSource(id)).filter(Boolean);
  const classSet = new Set(citedSources.map((source) => source!.sourceClass));
  const bucketSet = new Set(ctx.input.citedBucketIds);
  const citedCount = ctx.input.uniqueCitedSourceIds.length;
  const weakCount = citedSources.filter((source) => source!.citationStrength === "weak" || source!.citationStrength === "ineligible").length;
  // Count true snippet extractions only. limitedSource alone is not snippet-equivalent —
  // council routinely needs 110 cites and many strong full/partial cards are still flagged limited.
  const snippetCount = citedSources.filter((source) => source!.extractionQuality === "snippet").length;
  const bucketCounts = new Map<string, number>();
  // Attribute each cited source to its primary (first) bucket only. Deduper merges
  // cross-bucket discoveries into bucketIds[], and counting every membership made
  // concentrationRatio hit 1.0 whenever a popular tag appeared on most cards — then
  // the floor-met 0.95 slack still fatal'd "one bucket dominates".
  for (const source of citedSources) {
    const primary = source!.bucketIds[0];
    if (primary) bucketCounts.set(primary, (bucketCounts.get(primary) ?? 0) + 1);
  }
  const largestBucket = Math.max(0, ...bucketCounts.values());
  const snippetRatio = citedCount ? snippetCount / citedCount : 1;
  const weakRatio = citedCount ? weakCount / citedCount : 1;
  const concentrationRatio = citedCount ? largestBucket / citedCount : 1;
  const sourceGapRatio = thresholds.minCitedSources > 0 ? citedCount / thresholds.minCitedSources : 1;
  const availableBucketCount = new Set(
    ctx.registry.getCitationEligibleSources().flatMap((source) => source.bucketIds),
  ).size;
  // Do not fail the run for buckets the registry never retrieved.
  const effectiveMinBuckets = Math.min(thresholds.minBuckets, Math.max(1, availableBucketCount));
  const eligible = ctx.registry.getCitationEligibleSources();
  const registrySnippetRatio = eligible.length
    ? eligible.filter((source) => source.extractionQuality === "snippet").length / eligible.length
    : 1;
  const registryWeakRatio = eligible.length
    ? eligible.filter((source) => source.citationStrength === "weak" || source.citationStrength === "ineligible").length / eligible.length
    : 1;
  // Keep mode thresholds as floors. Once the cite floor is met, never require a cleaner
  // mix than retrieval delivered (plus a small slack). The hard 0.65/0.7 caps previously
  // contradicted that and failed fast_research when enrichment was mostly snippet_fallback.
  const floorMet = citedCount >= thresholds.minCitedSources;
  // Cap at 1.0, not 0.95: a 0.95 ceiling forced "cleaner than registry" whenever
  // retrieval itself was ≥90% weak/snippet/concentrated — live fast_research dual-fatals.
  const effectiveMaxSnippetRatio = floorMet
    ? Math.max(thresholds.maxSnippetRatio, Math.min(1, registrySnippetRatio + 0.05))
    : thresholds.maxSnippetRatio;
  const effectiveMaxWeakRatio = floorMet
    ? Math.max(thresholds.maxWeakRatio, Math.min(1, registryWeakRatio + 0.05))
    : thresholds.maxWeakRatio;
  // Same floor-met slack as snippet/weak: do not fail concentration when the eligible
  // registry itself is already that concentrated (plus a small slack).
  const registryBucketCounts = new Map<string, number>();
  for (const source of eligible) {
    const primary = source.bucketIds[0];
    if (primary) registryBucketCounts.set(primary, (registryBucketCounts.get(primary) ?? 0) + 1);
  }
  const registryLargestBucket = Math.max(0, ...registryBucketCounts.values());
  const registryConcentrationRatio = eligible.length ? registryLargestBucket / eligible.length : 1;
  const effectiveMaxBucketConcentrationRatio = floorMet
    ? Math.max(thresholds.maxBucketConcentrationRatio, Math.min(1, registryConcentrationRatio + 0.05))
    : thresholds.maxBucketConcentrationRatio;
  const allowCitationCountGapWarning =
    Boolean(ctx.input.sourceGapReport)
    && (ctx.input.mode === "fast_research" || ctx.input.mode === "deep_research" || ctx.input.mode === "council")
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
  if (bucketSet.size < effectiveMinBuckets) {
    const message = bucketSet.size <= 2 && citedCount >= thresholds.minCitedSources
      ? "citations concentrated in only 1-2 buckets"
      : `bucket_concentration: ${bucketSet.size} buckets below ${effectiveMinBuckets}`;
    issues.push({
      code: "bucket_concentration",
      message,
      severity: "fatal" as const,
    });
  }
  if (snippetRatio > effectiveMaxSnippetRatio || weakRatio > effectiveMaxWeakRatio) {
    issues.push({
      code: "source_quality",
      message: "source_quality: weak or snippet-only source ratio is too high",
      severity: "fatal" as const,
    });
  }
  if (concentrationRatio > effectiveMaxBucketConcentrationRatio && citedCount >= thresholds.minCitedSources) {
    issues.push({
      code: "bucket_concentration",
      message: "bucket_concentration: one bucket dominates cited evidence",
      severity: "fatal" as const,
    });
  }

  const score = Math.max(0, 20
    - Math.max(0, thresholds.minCitedSources - citedCount)
    - Math.max(0, thresholds.minSourceClasses - classSet.size) * 2
    - Math.max(0, effectiveMinBuckets - bucketSet.size) * 2
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
      effectiveMinBuckets,
      availableBucketCount,
    },
    categoryScores: {
      sourceBucketCoverage: Math.min(15, bucketSet.size >= effectiveMinBuckets ? 15 : bucketSet.size),
      sourceContract: citedCount >= thresholds.minCitedSources ? 15 : 0,
    },
  };
}
