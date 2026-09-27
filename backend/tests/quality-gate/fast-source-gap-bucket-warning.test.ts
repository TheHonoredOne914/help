import test from "node:test";
import assert from "node:assert/strict";
import { runHarnessQualityGate } from "./harness/fixtures.js";
import { thresholdsFor } from "../../src/core/quality-gate/mode-thresholds.js";
import { runSourceDiversityGate } from "../../src/core/quality-gate/source-diversity-gate.js";
import { createQualityGateHarnessFixture, buildPassingAnswer } from "./harness/fixtures.js";

test("fast_research source gaps do not downgrade bucket concentration failures", () => {
  // Cites much more concentrated than the eligible registry — must stay fatal even with a SourceGapReport.
  const sourceIds = Array.from({ length: 40 }, (_, index) => index + 1);
  const buckets = ["government_official", "parliamentary_records", "court_legal", "indian_major_media"] as const;
  const makeSource = (id: number) => ({
    id,
    sourceClass: "official_government" as const,
    // Registry is evenly spread; cited set below is almost all government_official.
    bucketIds: [buckets[(id - 1) % buckets.length]],
    citationStrength: "medium" as const,
    extractionQuality: "partial" as const,
    limitedSource: false,
  });
  const registry = {
    getSource: (id: number) => makeSource(id),
    getCitationEligibleSources: () => sourceIds.map(makeSource),
  };
  const citedIds = [
    ...sourceIds.filter((id) => makeSource(id).bucketIds[0] === "government_official"),
    ...sourceIds.filter((id) => makeSource(id).bucketIds[0] !== "government_official").slice(0, 2),
  ].slice(0, 40);

  const result = runSourceDiversityGate({
    finalText: "",
    contract: {} as any,
    registry: registry as any,
    input: {
      uniqueCitedSourceIds: citedIds,
      citedBucketIds: ["government_official", "parliamentary_records"],
      modelRoleOutputs: [],
      mode: "fast_research",
      sourceGapReport: { explanation: "Only one strong bucket survived retrieval." },
    },
  }, thresholdsFor("fast_research"));

  assert.ok(
    result.issues.some((issue) => issue.code === "bucket_concentration" && issue.severity === "fatal"),
    "bucket concentration should remain fatal",
  );
});

test("fast_research source gaps do not downgrade far-short mode-depth or source-quality misses", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({
    mode: "fast_research",
    sourceCount: 4,
    snippetOnly: true,
  });

  const report = runHarnessQualityGate(buildPassingAnswer(registry, "fast_research"), contract, registry, {
    ...input,
    uniqueCitedSourceIds: [1, 2, 3, 4],
    citedBucketIds: ["government_official", "parliamentary_records"],
    sourceGapReport: { explanation: "Only four citation-eligible sources survived live extraction." },
  } as any);

  assert.ok(report.fatalIssues.some((issue) => /mode_depth/.test(issue)), "far-short mode depth should remain fatal");
  assert.ok(report.fatalIssues.some((issue) => /source_quality/.test(issue)), "source quality should remain fatal");
});

test("fast_research floor-met cites matching a concentrated registry do not fail bucket_concentration ratio", () => {
  const sourceIds = Array.from({ length: 40 }, (_, index) => index + 1);
  const classes = ["official_government", "parliamentary_records", "legal_commentary", "indian_major_media"] as const;
  const buckets = ["government_official", "parliamentary_records", "court_legal", "indian_major_media"] as const;
  // ~80% of eligible share one bucket — mirrors live fast_research authority clustering.
  const makeSource = (id: number) => ({
    id,
    sourceClass: classes[id % classes.length],
    bucketIds: [id <= 32 ? buckets[0] : buckets[((id - 1) % 3) + 1]],
    citationStrength: "medium" as const,
    extractionQuality: "partial" as const,
    limitedSource: false,
  });
  const registry = {
    getSource: (id: number) => makeSource(id),
    getCitationEligibleSources: () => sourceIds.map(makeSource),
  };

  const result = runSourceDiversityGate({
    finalText: "",
    contract: {} as any,
    registry: registry as any,
    input: {
      uniqueCitedSourceIds: sourceIds,
      citedBucketIds: [...buckets],
      modelRoleOutputs: [],
      mode: "fast_research",
    },
  }, thresholdsFor("fast_research"));

  assert.ok(
    !result.issues.some((issue) => issue.code === "bucket_concentration" && /dominates cited evidence/i.test(issue.message)),
    "must not require cleaner concentration than registry delivered once cite floor is met",
  );
});

test("fast_research floor-met cites matching a 96% weak registry do not fail source_quality", () => {
  // Prior Math.min(0.95, registry+0.05) forced cleaner-than-registry when retrieval was ≥90% weak.
  const sourceIds = Array.from({ length: 40 }, (_, index) => index + 1);
  const classes = ["official_government", "parliamentary_records", "legal_commentary", "indian_major_media"] as const;
  const buckets = ["government_official", "parliamentary_records", "court_legal", "indian_major_media"] as const;
  const makeSource = (id: number) => ({
    id,
    sourceClass: classes[id % classes.length],
    bucketIds: [buckets[id % buckets.length]],
    citationStrength: id <= 38 ? "weak" as const : "medium" as const,
    extractionQuality: id <= 38 ? "snippet" as const : "partial" as const,
    limitedSource: id <= 38,
  });
  const registry = {
    getSource: (id: number) => makeSource(id),
    getCitationEligibleSources: () => sourceIds.map(makeSource),
  };

  const result = runSourceDiversityGate({
    finalText: "",
    contract: {} as any,
    registry: registry as any,
    input: {
      uniqueCitedSourceIds: sourceIds,
      citedBucketIds: [...buckets],
      modelRoleOutputs: [],
      mode: "fast_research",
    },
  }, thresholdsFor("fast_research"));

  assert.ok(
    !result.issues.some((issue) => issue.code === "source_quality"),
    "must not require cleaner than a ≥90% weak/snippet registry once cite floor is met",
  );
});

test("multi-bucket merged tags do not inflate concentrationRatio past 1.0 on primary bucket", () => {
  // Deduper merges cross-bucket hits onto one card; counting every membership previously
  // made concentrationRatio=1.0 and fatally failed under the 0.95 floor-met slack.
  const sourceIds = Array.from({ length: 40 }, (_, index) => index + 1);
  const buckets = ["government_official", "parliamentary_records", "court_legal", "indian_major_media"] as const;
  const makeSource = (id: number) => ({
    id,
    sourceClass: "official_government" as const,
    // Primary rotates; government_official is also glued onto every card as a secondary tag.
    bucketIds: [buckets[(id - 1) % buckets.length], "government_official"],
    citationStrength: "medium" as const,
    extractionQuality: "partial" as const,
    limitedSource: false,
  });
  const registry = {
    getSource: (id: number) => makeSource(id),
    getCitationEligibleSources: () => sourceIds.map(makeSource),
  };

  const result = runSourceDiversityGate({
    finalText: "",
    contract: {} as any,
    registry: registry as any,
    input: {
      uniqueCitedSourceIds: sourceIds,
      citedBucketIds: [...buckets],
      modelRoleOutputs: [],
      mode: "fast_research",
    },
  }, thresholdsFor("fast_research"));

  assert.ok(
    (result.metrics.concentrationRatio as number) <= 0.25 + 1e-9,
    `primary-only concentration should be ~0.25, got ${result.metrics.concentrationRatio}`,
  );
  assert.ok(
    !result.issues.some((issue) => issue.code === "bucket_concentration" && /dominates cited evidence/i.test(issue.message)),
    "merged secondary tags must not fatal bucket_concentration",
  );
});

test("fast_research floor-met cites matching a snippet-heavy registry do not fail source_quality", () => {
  const sourceIds = Array.from({ length: 40 }, (_, index) => index + 1);
  const classes = ["official_government", "parliamentary_records", "legal_commentary", "indian_major_media"] as const;
  const buckets = ["government_official", "parliamentary_records", "court_legal", "indian_major_media"] as const;
  const makeSource = (id: number) => ({
    id,
    sourceClass: classes[id % classes.length],
    bucketIds: [buckets[id % buckets.length]],
    // ~90% snippets mirrors live fast_research enrichment yield
    citationStrength: id % 10 === 0 ? "medium" : "weak",
    extractionQuality: id % 10 === 0 ? "partial" : "snippet",
    limitedSource: id % 10 !== 0,
  });
  const registry = {
    getSource: (id: number) => makeSource(id),
    getCitationEligibleSources: () => sourceIds.map(makeSource),
  };

  const result = runSourceDiversityGate({
    finalText: "",
    contract: {} as any,
    registry: registry as any,
    input: {
      uniqueCitedSourceIds: sourceIds,
      citedBucketIds: [...buckets],
      modelRoleOutputs: [],
      mode: "fast_research",
    },
  }, thresholdsFor("fast_research"));

  assert.ok(!result.issues.some((issue) => issue.code === "source_quality"), "must not require cleaner mix than registry delivered once cite floor is met");
});

test("fast_research source gaps can downgrade only a near-miss cited-source count", () => {
  const sourceIds = Array.from({ length: 32 }, (_, index) => index + 1);
  const classes = ["official_government", "parliamentary_records", "legal_commentary"] as const;
  const buckets = ["government_official", "parliamentary_records", "court_legal"] as const;
  const registry = {
    getSource: (id: number) => ({
      id,
      sourceClass: classes[id % classes.length],
      bucketIds: [buckets[id % buckets.length]],
      citationStrength: "strong",
      extractionQuality: "full",
      limitedSource: false,
    }),
    getCitationEligibleSources: () => sourceIds.map((id) => ({
      id,
      sourceClass: classes[id % classes.length],
      bucketIds: [buckets[id % buckets.length]],
    })),
  };

  const result = runSourceDiversityGate({
    finalText: "",
    contract: {} as any,
    registry: registry as any,
    input: {
      uniqueCitedSourceIds: sourceIds,
      citedBucketIds: [...buckets],
      modelRoleOutputs: [],
      mode: "fast_research",
      sourceGapReport: { explanation: "Near-miss source count after live retrieval." },
    },
  }, thresholdsFor("fast_research"));

  assert.ok(result.issues.some((issue) => issue.code === "mode_depth" && issue.severity === "warning"));
  assert.ok(!result.issues.some((issue) => issue.code !== "mode_depth" && issue.severity === "warning"));
});
