import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationCandidates } from "../../src/core/generation/core-answer-generator.js";
import { OPENCODE_ZEN_STRONG_MODEL } from "../../src/core/providers/opencode-zen-provider.js";

test("stale cerebras llama3.1-8b is remapped to opencode instead of the retired 8b model", () => {
  const candidates = buildGenerationCandidates({
    providerName: "cerebras",
    model: "llama3.1-8b",
    mode: "fast_research",
    autoFallback: true,
    providerRouter: {
      hasProvider: (name: string) => name === "opencode" || name === "cerebras" || name === "groq",
      getRegisteredProviderNames: () => ["opencode", "cerebras", "groq"],
    },
    providerStatuses: [
      {
        providerName: "opencode",
        configured: true,
        healthy: true,
        canChat: true,
        status: "healthy",
        chatVerified: true,
        models: [OPENCODE_ZEN_STRONG_MODEL],
      },
      {
        providerName: "cerebras",
        configured: true,
        healthy: true,
        canChat: true,
        status: "healthy",
        chatVerified: true,
        models: ["llama3.3-70b", "llama3.1-8b"],
      },
      {
        providerName: "groq",
        configured: true,
        healthy: true,
        canChat: true,
        status: "healthy",
        chatVerified: true,
        models: ["llama-3.3-70b-versatile"],
      },
    ],
  } as any);

  assert.ok(candidates.length >= 1, `expected candidates, got ${JSON.stringify(candidates)}`);
  assert.ok(!candidates.some((c) => /llama3\.1-8b/i.test(c.model)), `unexpected 8b: ${JSON.stringify(candidates)}`);
  assert.equal(candidates[0]?.providerName, "opencode");
  assert.equal(candidates[0]?.model, OPENCODE_ZEN_STRONG_MODEL);
});
