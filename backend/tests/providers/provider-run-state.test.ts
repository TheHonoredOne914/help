import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRunState } from "../../src/core/providers/provider-run-state.js";

test("429 creates run-scoped cooldown without exposing raw provider details", () => {
  let now = 10_000;
  const state = createProviderRunState(() => now);

  state.recordFailure("groq", { code: "rate_limited", retryAfterMs: 20_000 });

  assert.equal(state.isCooledDown("groq"), true);
  assert.equal(state.shouldSkipProvider("groq", "core_generation", "fast_research"), true);
  assert.deepEqual(state.getSafeMetadata("groq"), {
    providerName: "groq",
    failures: 1,
    cooledDown: true,
    cooldownRemainingMs: 20_000,
    blockedProvider: true,
    requestTooLargeCount: 0,
    jsonFailureCount: 0,
    lastErrorCode: "rate_limited",
  });

  now = 31_000;
  assert.equal(state.isCooledDown("groq"), false);
});

test("413 and invalid JSON counts are tracked separately", () => {
  const state = createProviderRunState(() => 1_000);

  state.recordFailure("nvidia", { code: "request_too_large" });
  state.recordInvalidJson("nvidia");

  assert.equal(state.get("nvidia")?.requestTooLargeCount, 1);
  assert.equal(state.get("nvidia")?.jsonFailureCount, 1);
  assert.equal(state.shouldRetrySamePrompt("nvidia"), false);
});
