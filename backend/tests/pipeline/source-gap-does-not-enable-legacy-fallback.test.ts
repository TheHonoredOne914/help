import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";
import { fakePreloadedSources } from "./harness/fake-runtime.js";

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

test("below-floor sparse evidence fails closed without core generation", async () => {
  let coreStarted = false;
  const result = await runResearchPipeline({
    requestId: "source-gap-no-fallback",
    userQuery: "Deep research India parliamentary accountability 2026",
    mode: "deep_research",
    preloadedSources: sparseSources as any,
    liveRetrieval: false,
    forceCoreGenerationFailure: true,
    generationMode: "deterministic",
    emit: (event) => {
      if (event.type === "core_generation_started") coreStarted = true;
    },
  });

  assert.equal(coreStarted, false);
  assert.equal(result.terminalStatus, "failed");
  assert.equal(result.usedCoreGeneration, false);
  assert.equal(result.usedLegacyFallback, false);
  assert.match(result.finalAnswer, /Insufficient Sources/i);
});

test("explicit fallback is skipped when citation-eligible floor is missed", async () => {
  const result = await runResearchPipeline({
    requestId: "source-gap-explicit-fallback",
    userQuery: "Deep research India parliamentary accountability 2026",
    mode: "deep_research",
    preloadedSources: sparseSources as any,
    liveRetrieval: false,
    useCoreGeneration: false,
    emergencyCompatibilityMode: true,
    generationMode: "deterministic",
    legacyFallback: async () => "should not emit long form",
  });

  assert.equal(result.usedLegacyFallback, false);
  assert.equal(result.terminalStatus, "failed");
  assert.match(result.finalAnswer, /Insufficient Sources/i);
});

test("core generation failure still allows explicit legacy fallback when floor is met", async () => {
  const result = await runResearchPipeline({
    requestId: "floor-met-legacy-fallback",
    userQuery: "Deep research India parliamentary accountability 2026",
    mode: "deep_research",
    preloadedSources: fakePreloadedSources(50) as any,
    liveRetrieval: false,
    forceCoreGenerationFailure: true,
    useCoreGeneration: true,
    generationMode: "deterministic",
    legacyFallback: async ({ evidenceRegistry }) => {
      const source = evidenceRegistry.getCitationEligibleSources()[0]!;
      return `Cited fallback [Source ${source.id}](${source.url})`;
    },
  });

  assert.equal(result.usedLegacyFallback, true);
  assert.match(result.finalAnswer, /Cited fallback/i);
});
