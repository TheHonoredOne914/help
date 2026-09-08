import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";
import { fakePreloadedSources } from "./harness/fake-runtime.js";

test("fast_research below 40 eligible sources skips core generation and fails closed", async () => {
  let coreGenerationStarted = false;
  const events: string[] = [];

  const result = await runResearchPipeline({
    requestId: "fast-floor-gate",
    userQuery: "quick GST Council federalism brief",
    mode: "fast_research",
    preloadedSources: fakePreloadedSources(14),
    liveRetrieval: false,
    useCoreGeneration: true,
    generationMode: "deterministic",
    allowSyntheticSourceUsage: true,
    legacyFallback: async () => {
      throw new Error("legacy fallback must not run when citation-eligible floor is missed");
    },
    emit: (event) => {
      events.push(event.type);
      if (event.type === "core_generation_started") coreGenerationStarted = true;
    },
  });

  assert.equal(coreGenerationStarted, false);
  assert.equal(result.usedCoreGeneration, false);
  assert.equal(result.usedLegacyFallback, false);
  assert.equal(result.terminalStatus, "failed");
  assert.notEqual(result.terminalStatus, "completed_with_source_gaps");
  assert.ok(result.sourceGapReport);
  assert.ok((result.sourceGapReport?.availableCitationEligibleSources ?? 0) < 40);
  assert.match(result.finalAnswer, /Insufficient Sources/i);
  assert.ok(events.includes("pipeline_failed") || events.includes("failed"));
});
