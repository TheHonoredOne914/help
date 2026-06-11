import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

test("fallback after generation failure includes explicit degraded metadata and event", async () => {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const result = await runResearchPipeline({
    requestId: "fallback-truth-generation-failure",
    userQuery: "India democratic space 2022-2025",
    mode: "deep_research",
    preloadedSources: fixtureSources as any,
    forceCoreGenerationFailure: true,
    legacyFallback: async ({ evidenceRegistry }) => `# Executive Thesis
Fallback answer with Indian Parliament framing, Treasury Bench, Opposition, POI, rebuttal, motion, amendment, central contradiction and strategic synthesis. ${Array.from({ length: 30 }, (_, index) => evidenceRegistry.getCitationMarkdown(index + 1)).join(" ")}`,
    emit: (event) => events.push({ type: event.type, data: event.data ?? {} }),
  });

  assert.equal(result.usedLegacyFallback, true);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackCode, "unexpected_generation_failure");
  assert.equal(result.originalFailureType, "generation_failure");
  assert.match(result.fallbackReason ?? "", /forced core generation failure/i);
  assert.ok(events.some((event) =>
    event.type === "legacy_fallback_used"
    && event.data.fallbackCode === "unexpected_generation_failure"
    && event.data.originalFailureType === "generation_failure"
  ));
});

test("compatibility fallback is distinguishable from unexpected generation failure", async () => {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const result = await runResearchPipeline({
    requestId: "fallback-truth-compatibility",
    userQuery: "India democratic space 2022-2025",
    mode: "deep_research",
    preloadedSources: fixtureSources as any,
    useCoreGeneration: false,
    emergencyCompatibilityMode: true,
    emit: (event) => events.push({ type: event.type, data: event.data ?? {} }),
  });

  assert.equal(result.usedLegacyFallback, true);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackCode, "compatibility_fallback");
  assert.equal(result.originalFailureType, undefined);
  assert.match(result.fallbackReason ?? "", /emergency compatibility mode/i);
  assert.ok(events.some((event) =>
    event.type === "legacy_fallback_used"
    && event.data.fallbackCode === "compatibility_fallback"
    && event.data.originalFailureType === undefined
  ));
});
