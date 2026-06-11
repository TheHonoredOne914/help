import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRunState } from "../../src/core/providers/provider-run-state.js";

test("GitHub request-too-large blocks only the same prompt/model combo", () => {
  const state = createProviderRunState(() => 1_000);

  state.recordFailure("github", { code: "request_too_large" }, { model: "openai/gpt-4.1", promptFingerprint: "prompt-a" });

  assert.equal(state.shouldRetrySamePrompt("github", "openai/gpt-4.1", "prompt-a"), false);
  assert.equal(state.shouldRetrySamePrompt("github", "openai/gpt-4.1", "prompt-b"), true);
  assert.equal(state.shouldRetrySamePrompt("github", "openai/gpt-4.1-mini", "prompt-a"), true);
});

test("NVIDIA timeout cools down only the exact model", () => {
  const state = createProviderRunState(() => 2_000);

  state.recordFailure("nvidia", { code: "timeout", retryAfterMs: 12_000 }, { model: "moonshotai/kimi-k2.6" });

  assert.equal(state.shouldSkipModel("nvidia", "moonshotai/kimi-k2.6"), true);
  assert.equal(state.shouldSkipModel("nvidia", "nvidia/llama-3.3-nemotron-super-49b-v1"), false);
  assert.equal(state.getSafeMetadata("nvidia")?.cooldownRemainingMs, 12_000);
});
