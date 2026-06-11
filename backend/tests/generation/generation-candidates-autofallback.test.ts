import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationCandidates } from "../../src/core/generation/core-answer-generator.js";
import { createProviderRunState } from "../../src/core/providers/provider-run-state.js";
import { FakeProviderRouter } from "../harness/fake-provider-router.js";

test("core generation candidates do not append fallback providers when autoFallback=false", () => {
  const router = new FakeProviderRouter()
    .script("groq", [{ type: "success", content: "ok" }])
    .script("nvidia", [{ type: "success", content: "ok" }]);

  const candidates = buildGenerationCandidates({
    mode: "fast_research",
    providerRouter: router as any,
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    autoFallback: false,
    providerStatuses: [
      { providerName: "groq", configured: true, status: "unverified", healthy: false, canChat: true, chatVerified: false },
      { providerName: "nvidia", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true },
    ],
  } as any);

  assert.deepEqual(candidates, [{ providerName: "groq", model: "llama-3.3-70b-versatile" }]);
});

test("core generation candidates append fallback providers only when autoFallback=true", () => {
  const router = new FakeProviderRouter()
    .script("groq", [{ type: "success", content: "ok" }])
    .script("nvidia", [{ type: "success", content: "ok" }]);

  const candidates = buildGenerationCandidates({
    mode: "fast_research",
    providerRouter: router as any,
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    autoFallback: true,
    providerStatuses: [
      { providerName: "groq", configured: true, status: "rate_limited", healthy: false, canChat: false, chatVerified: false },
      { providerName: "nvidia", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true },
    ],
  } as any);

  assert.deepEqual(candidates, [{ providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" }]);
});

test("explicit selected core generation candidate is not hidden by source-usage cooldown", () => {
  const router = new FakeProviderRouter()
    .script("groq", [{ type: "success", content: "ok" }])
    .script("openrouter", [{ type: "success", content: "ok" }]);
  const runState = createProviderRunState(() => 1_000);
  runState.recordFailure("groq", { code: "rate_limited", retryAfterMs: 30_000 });

  const candidates = buildGenerationCandidates({
    mode: "deep_research",
    providerRouter: router as any,
    providerName: "groq",
    model: "openai/gpt-oss-120b",
    autoFallback: true,
    providerRunState: runState,
    providerStatuses: [
      { providerName: "groq", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true, models: ["openai/gpt-oss-120b"] },
      { providerName: "openrouter", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true, models: ["qwen/qwen3-32b:free"] },
    ],
  } as any);

  assert.equal(candidates[0]?.providerName, "groq");
  assert.equal(candidates[0]?.model, "openai/gpt-oss-120b");
});
