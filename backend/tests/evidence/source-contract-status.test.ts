import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSourceContract } from "../../src/core/evidence/source-contract.js";

test("deep research source gap is partial, not strict pass", () => {
  const result = evaluateSourceContract({
    mode: "deep_research",
    requiredSources: 20,
    citationEligibleSources: 15,
    finalUniqueCitedSources: 15,
    sourceGapReport: { explanation: "Fewer than 20 citation-eligible sources were available." },
  });

  assert.equal(result.status, "passed_with_source_gaps");
  assert.equal(result.passedStrict, false);
  assert.equal(result.passedWithSourceGaps, true);
  assert.equal(result.passed, true);
});

test("deep research source shortfall without SourceGapReport fails", () => {
  const result = evaluateSourceContract({
    mode: "deep_research",
    requiredSources: 20,
    citationEligibleSources: 15,
    finalUniqueCitedSources: 15,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.passedStrict, false);
  assert.equal(result.passed, false);
});

test("PhD and council require strict source completion by default", () => {
  for (const mode of ["deep_research", "council"] as const) {
    const result = evaluateSourceContract({
      mode,
      requiredSources: 30,
      citationEligibleSources: 20,
      finalUniqueCitedSources: 20,
      sourceGapReport: { explanation: "Shortfall." },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.passedWithSourceGaps, false);
  }
});

test("fast research can pass with source gaps when evidence exists", () => {
  const result = evaluateSourceContract({
    mode: "fast_research",
    requiredSources: 10,
    citationEligibleSources: 8,
    finalUniqueCitedSources: 8,
    sourceGapReport: { explanation: "Search exhausted." },
  });

  assert.equal(result.status, "passed_with_source_gaps");
});

test("source contract score zero cannot be a normal pass", () => {
  const result = evaluateSourceContract({
    mode: "deep_research",
    requiredSources: 20,
    citationEligibleSources: 15,
    finalUniqueCitedSources: 15,
    sourceGapReport: { explanation: "Search exhausted." },
    categoryScores: { sourceContract: 0 },
  });

  assert.notEqual(result.status, "passed");
  assert.equal(result.passedStrict, false);
});
