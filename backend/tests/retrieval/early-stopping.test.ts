import test from "node:test";
import assert from "node:assert/strict";
import { computeEvidenceScore, shouldStopRetrievalEarly, weightForEvidenceSource } from "../../src/core/retrieval/early-stopping.js";

const deepBuckets = [
  "democracy_index",
  "government_official",
  "court_legal",
  "human_rights_watchdog",
  "civic_space",
  "press_freedom",
  "digital_rights",
];

test("weightForEvidenceSource: full=1, limited=0.35, eligible-snippet=0.35", () => {
  assert.equal(weightForEvidenceSource({ extractionQuality: "full", citationEligible: true }), 1);
  assert.equal(weightForEvidenceSource({ extractionQuality: "partial", citationEligible: true }), 0.35);
  assert.equal(weightForEvidenceSource({ extractionQuality: "full", citationEligible: true, limitedSource: true }), 0.35);
  assert.equal(weightForEvidenceSource({ extractionQuality: "snippet", citationEligible: true }), 0.35);
  assert.equal(weightForEvidenceSource({ extractionQuality: "snippet", citationEligible: false }), 0);
  assert.equal(weightForEvidenceSource({ extractionQuality: "failed" }), 0);
});

test("computeEvidenceScore caps single-bucket contribution at 25% of target", () => {
  const sources = Array.from({ length: 40 }, () => ({
    bucketIds: ["court_legal"],
    extractionQuality: "full" as const,
    citationEligible: true,
  }));
  const score = computeEvidenceScore(sources, { targetScore: 45 });
  assert.ok(score <= 45 * 0.25 + 1e-9);
  assert.ok(score >= 11);
});

test("deep mode stops when evidence score >= 45, 7 buckets, no critical gaps", () => {
  const evidenceSources = deepBuckets.flatMap((bucketId) =>
    Array.from({ length: 7 }, () => ({
      bucketIds: [bucketId],
      extractionQuality: "full" as const,
      citationEligible: true,
    })),
  );
  const evidenceScore = computeEvidenceScore(evidenceSources, { targetScore: 45 });
  assert.ok(evidenceScore >= 45);
  const result = shouldStopRetrievalEarly({
    mode: "deep_research",
    evidenceScore,
    coveredBucketIds: deepBuckets,
    finalCitationsRealistic: true,
    criticalMissingBucketIds: [],
  });
  assert.equal(result.stop, true);
});

test("deep mode does not stop when legal bucket is missing for a legal topic", () => {
  const result = shouldStopRetrievalEarly({
    mode: "deep_research",
    evidenceScore: 80,
    coveredBucketIds: ["democracy_index", "government_official", "human_rights_watchdog", "civic_space", "press_freedom", "digital_rights", "electoral_integrity", "academic_research", "policy_research"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: ["court_legal"],
  });

  assert.equal(result.stop, false);
  assert.match(result.reason, /critical bucket/i);
});

test("fast mode does not stop below evidence score 40", () => {
  const result = shouldStopRetrievalEarly({
    mode: "fast_research",
    evidenceScore: 12,
    coveredBucketIds: ["democracy_index", "government_official", "court_legal", "press_freedom", "electoral_integrity"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: [],
  });

  assert.equal(result.stop, false);
  assert.match(result.reason, /Need evidence score 40/i);
});

test("fast mode can stop with evidence score 40 and 5 major buckets", () => {
  const result = shouldStopRetrievalEarly({
    mode: "fast_research",
    evidenceScore: 40,
    coveredBucketIds: ["democracy_index", "government_official", "court_legal", "press_freedom", "electoral_integrity"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: [],
  });

  assert.equal(result.stop, true);
});

test("council early-stop target is 110", () => {
  const result = shouldStopRetrievalEarly({
    mode: "council",
    evidenceScore: 109,
    coveredBucketIds: [...deepBuckets, "electoral_integrity"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: [],
  });
  assert.equal(result.stop, false);
  assert.match(result.reason, /Need evidence score 110/i);
});
