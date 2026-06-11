import test from "node:test";
import assert from "node:assert/strict";
import { shouldStopRetrievalEarly } from "../../src/core/retrieval/early-stopping.js";

test("phd mode stops only after 40 eligible sources, 9 buckets, and realistic 30 citations", () => {
  const result = shouldStopRetrievalEarly({
    mode: "deep_research",
    citationEligibleSources: 42,
    coveredBucketIds: ["democracy_index", "government_official", "court_legal", "human_rights_watchdog", "civic_space", "press_freedom", "digital_rights", "electoral_integrity", "academic_research"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: [],
  });

  assert.equal(result.stop, true);
});

test("phd mode does not stop when legal bucket is missing for a legal topic", () => {
  const result = shouldStopRetrievalEarly({
    mode: "deep_research",
    citationEligibleSources: 80,
    coveredBucketIds: ["democracy_index", "government_official", "human_rights_watchdog", "civic_space", "press_freedom", "digital_rights", "electoral_integrity", "academic_research", "policy_research"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: ["court_legal"],
  });

  assert.equal(result.stop, false);
  assert.match(result.reason, /critical bucket/i);
});

test("fast mode does not stop below the 40-source contract", () => {
  const result = shouldStopRetrievalEarly({
    mode: "fast_research",
    citationEligibleSources: 12,
    coveredBucketIds: ["democracy_index", "government_official", "court_legal", "press_freedom", "electoral_integrity"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: [],
  });

  assert.equal(result.stop, false);
  assert.match(result.reason, /Need 40 citation-eligible sources/i);
});

test("fast mode can stop with 40 eligible sources and 5 major buckets", () => {
  const result = shouldStopRetrievalEarly({
    mode: "fast_research",
    citationEligibleSources: 40,
    coveredBucketIds: ["democracy_index", "government_official", "court_legal", "press_freedom", "electoral_integrity"],
    finalCitationsRealistic: true,
    criticalMissingBucketIds: [],
  });

  assert.equal(result.stop, true);
});
