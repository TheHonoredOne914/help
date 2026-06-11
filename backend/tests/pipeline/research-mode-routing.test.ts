import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

test("direct fast_research pipeline triggers live retrieval by default", async () => {
  const events: string[] = [];

  const result = await runResearchPipeline({
    requestId: "fast-direct",
    userQuery: "Judiciary and institutional autonomy in India",
    mode: "fast_research",
    allowMockRetrieval: true,
    generationMode: "deterministic",
    allowSyntheticSourceUsage: true,
    emit: (event) => events.push(event.type),
  });

  assert.ok(events.includes("bucket_search_started"));
  assert.ok(result.evidenceRegistry.sources.length > 0);
});

test("deep_research is not downgraded to deep_research", async () => {
  const modes: string[] = [];

  await runResearchPipeline({
    requestId: "phd-routing",
    userQuery: "Article 356 and federalism in India",
    mode: "deep_research",
    allowMockRetrieval: true,
    generationMode: "deterministic",
    allowSyntheticSourceUsage: true,
    emit: (event) => {
      if (event.data?.effectiveResearchMode) modes.push(String(event.data.effectiveResearchMode));
    },
  }).catch(() => undefined);

  assert.ok(modes.length > 0);
  assert.equal(modes.every((mode) => mode === "deep_research"), true);
});
