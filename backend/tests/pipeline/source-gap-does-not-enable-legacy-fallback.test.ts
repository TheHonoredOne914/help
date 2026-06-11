import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

const sparseSources = [
  {
    title: "Parliamentary source",
    url: "https://sansad.in/example",
    snippet: "India Parliament question evidence about accountability and constitutional challenge.",
    fullText: "India Parliament question evidence about accountability and constitutional challenge.",
    bucketIds: ["parliamentary_records"],
    citationEligible: true,
  },
];

test("SourceGapReport alone does not enable legacy fallback after core generation failure", async () => {
  await assert.rejects(() => runResearchPipeline({
    requestId: "source-gap-no-fallback",
    userQuery: "Deep research India parliamentary accountability 2026",
    mode: "deep_research",
    preloadedSources: sparseSources as any,
    liveRetrieval: false,
    forceCoreGenerationFailure: true,
    generationMode: "deterministic",
  }), /legacy fallback is disabled|forced core generation failure/i);
});

test("explicit fallback produces cited deterministic fallback language", async () => {
  const result = await runResearchPipeline({
    requestId: "source-gap-explicit-fallback",
    userQuery: "Deep research India parliamentary accountability 2026",
    mode: "deep_research",
    preloadedSources: sparseSources as any,
    liveRetrieval: false,
    useCoreGeneration: false,
    emergencyCompatibilityMode: true,
    generationMode: "deterministic",
  });

  assert.equal(result.usedLegacyFallback, true);
  assert.match(result.finalAnswer, /# Deterministic Cited Fallback/);
  assert.match(result.finalAnswer, /\[Source 1\]\(https:\/\/sansad\.in\/example\)/);
  assert.doesNotMatch(result.finalAnswer, /Legacy fallback answer retained/i);
});
