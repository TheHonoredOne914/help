import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRunState } from "../../src/core/providers/provider-run-state.js";
import type { ResearchMode } from "../../src/core/config/research-mode.js";

test("failure-count skip applies to all research modes, not only fast_research", () => {
  const modes: ResearchMode[] = ["fast_research", "deep_research", "deep_research", "council"];

  for (const mode of modes) {
    const state = createProviderRunState(() => 1_000);
    state.recordFailure("groq", { code: "network_error", status: 503 }, { model: "llama-3.3-70b-versatile" });
    state.recordFailure("groq", { code: "network_error", status: 503 }, { model: "llama-3.3-70b-versatile" });
    state.recordFailure("groq", { code: "network_error", status: 503 }, { model: "llama-3.3-70b-versatile" });

    assert.equal(state.shouldSkipProvider("groq", "core_generation", mode), true, `${mode} should skip broken provider`);
  }
});

test("rate limits, oversized prompts, and repeated timeouts skip unsafe retries", () => {
  const state = createProviderRunState(() => 5_000);

  state.recordFailure("openrouter", { code: "rate_limited", retryAfterMs: 30_000 }, { model: "free/model" });
  assert.equal(state.shouldSkipProvider("openrouter", "core_generation", "council"), true);

  state.recordFailure("groq", { code: "request_too_large", status: 413 }, {
    model: "llama-3.3-70b-versatile",
    promptFingerprint: "prompt-a",
  });
  assert.equal(state.shouldRetrySamePrompt("groq", "llama-3.3-70b-versatile", "prompt-a"), false);
  assert.equal(state.shouldRetrySamePrompt("groq", "llama-3.3-70b-versatile", "prompt-b"), true);

  state.recordFailure("gemini", { code: "timeout" }, { model: "gemini-2.5-flash" });
  state.recordFailure("gemini", { code: "timeout" }, { model: "gemini-2.5-flash" });
  assert.equal(state.shouldSkipProvider("gemini", "core_generation", "deep_research"), true);
});
