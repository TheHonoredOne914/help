import test from "node:test";
import assert from "node:assert/strict";
import { runThesisQualityGate } from "../../src/core/verification/thesis-quality-gate.js";
import { thresholdsFor } from "../../src/core/quality-gate/mode-thresholds.js";
import { runSourceDiversityGate } from "../../src/core/quality-gate/source-diversity-gate.js";
import { createQualityGateHarnessFixture, buildPassingAnswer } from "./harness/fixtures.js";

test("fast_research source gaps do not downgrade bucket concentration failures", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({
    mode: "fast_research",
    sourceCount: 8,
    concentratedBucket: true,
  });

  const report = runThesisQualityGate(buildPassingAnswer(registry, "fast_research"), contract, registry, {
    ...input,
    sourceGapReport: { explanation: "Only one strong bucket survived retrieval." },
  } as any);

  assert.ok(report.fatalIssues.some((issue) => /bucket_concentration/.test(issue)), "bucket concentration should remain fatal");
});

test("fast_research source gaps do not downgrade far-short mode-depth or source-quality misses", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({
    mode: "fast_research",
    sourceCount: 4,
    snippetOnly: true,
  });

  const report = runThesisQualityGate(buildPassingAnswer(registry, "fast_research"), contract, registry, {
    ...input,
    uniqueCitedSourceIds: [1, 2, 3, 4],
    citedBucketIds: ["government_official", "parliamentary_records"],
    sourceGapReport: { explanation: "Only four citation-eligible sources survived live extraction." },
  } as any);

  assert.ok(report.fatalIssues.some((issue) => /mode_depth/.test(issue)), "far-short mode depth should remain fatal");
  assert.ok(report.fatalIssues.some((issue) => /source_quality/.test(issue)), "source quality should remain fatal");
});

test("fast_research source gaps can downgrade only a near-miss cited-source count", () => {
  const sourceIds = Array.from({ length: 18 }, (_, index) => index + 1);
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
