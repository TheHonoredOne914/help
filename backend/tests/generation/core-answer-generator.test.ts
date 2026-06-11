import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

test("core pipeline produces final answer without legacy fallback by default", async () => {
  const events: string[] = [];
  const result = await runResearchPipeline({
    requestId: "core-default",
    userQuery: "India democratic space 2022-2025 with press freedom, UAPA, FCRA, ECI, Supreme Court and civil liberties",
    mode: "deep_research",
    preloadedSources: fixtureSources as any,
    emit: (event) => events.push(event.type),
  });

  assert.equal(result.usedLegacyFallback, false);
  assert.ok(result.usedCoreGeneration);
  assert.match(result.finalAnswer, /# Executive Thesis/);
  assert.match(result.finalAnswer, /# Research Angle Map/);
  assert.match(result.finalAnswer, /Treasury Bench arguments/i);
  assert.ok(result.citationReport.uniqueCitedSourceCount >= 30);
  assert.ok(events.includes("core_generation_started"));
  assert.ok(events.includes("final_answer_ready"));
});

test("legacy fallback is used only when core generation fails and still runs validators", async () => {
  const result = await runResearchPipeline({
    requestId: "core-forced-fail",
    userQuery: "India democratic space 2022-2025",
    mode: "deep_research",
    preloadedSources: fixtureSources as any,
    forceCoreGenerationFailure: true,
    legacyFallback: async ({ evidenceRegistry }) => `# Executive Thesis\nFallback answer with Indian Parliament framing, Treasury Bench, Opposition, POI, rebuttal, motion, amendment, central contradiction and strategic synthesis. ${Array.from({ length: 30 }, (_, index) => evidenceRegistry.getCitationMarkdown(index + 1)).join(" ")}`,
  });

  assert.equal(result.usedLegacyFallback, true);
  assert.equal(result.citationReport.passed, true);
  assert.equal(result.qualityGate.passed, false);
  assert.ok(result.qualityGate.repairRequired);
});

test("fast deterministic answer does not echo duplicate prompt or dump javascript shell text", async () => {
  const query = "Analyzing the Impact of UGC Regulations 2026 on Indian Higher Education: Consider academic autonomy, foreign university collaborations, and digital learning.";
  const result = await runResearchPipeline({
    requestId: "fast-ugc-clean-output",
    userQuery: `${query}: ${query}`,
    mode: "fast_research",
    preloadedSources: fixtureSources as any,
    generationMode: "deterministic",
  });

  assert.doesNotMatch(result.finalAnswer, new RegExp(`${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.doesNotMatch(result.finalAnswer, /JavaScript must be enabled|Decrease Font Size|Normal Theme|Advance Search/i);
});
