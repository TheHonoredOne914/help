import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRunState } from "../../src/core/providers/provider-run-state.js";

test("429 cools provider down for the current run", () => {
  const state = createProviderRunState(() => 1_000);
  state.recordFailure("groq", { code: "rate_limited", retryAfterMs: 17_000 });

  assert.equal(state.isCooledDown("groq"), true);
  assert.equal(state.shouldSkipProvider("groq", "source_usage", "fast_research"), true);
  assert.equal(state.get("groq")?.rateLimitedUntil, 18_000);
});

test("413 records request-too-large without retrying same prompt", () => {
  const state = createProviderRunState(() => 1_000);
  state.recordFailure("groq", { code: "request_too_large" });

  assert.equal(state.get("groq")?.requestTooLargeCount, 1);
  assert.equal(state.shouldRetrySamePrompt("groq"), false);
});
