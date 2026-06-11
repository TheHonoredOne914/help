import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

const TERMINAL_EVENTS = new Set([
  "completed",
  "completed_with_source_gaps",
  "degraded_fallback",
  "provider_error",
  "failed",
  "cancelled",
  "legacy_fallback_used",
]);

test("research pipeline emits exactly one terminal event", async () => {
  const terminalEvents: string[] = [];

  await runResearchPipeline({
    requestId: "terminal-event",
    userQuery: "Judiciary and institutional autonomy in India",
    mode: "fast_research",
    allowMockRetrieval: true,
    generationMode: "deterministic",
    allowSyntheticSourceUsage: true,
    emit: (event) => {
      if (TERMINAL_EVENTS.has(event.type)) terminalEvents.push(event.type);
    },
  });

  assert.equal(terminalEvents.length, 1);
  assert.ok(TERMINAL_EVENTS.has(terminalEvents[0]));
});
