import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRouter } from "../../src/core/providers/provider-router.js";
import { ProviderError } from "../../src/core/providers/provider-errors.js";

test("provider router supports timeout-aware typed role calls with usage metadata", async () => {
  const router = new ProviderRouter();
  router.register({
    name: "groq",
    complete: async (request) => ({
      provider: "groq",
      model: request.model,
      content: "ok",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 1,
      roleName: request.roleName,
    }),
  });

  const response = await router.complete("groq", {
    model: "llama",
    roleName: "evidence_extractor",
    messages: [{ role: "user", content: "hi" }],
    timeoutMs: 1000,
  });

  assert.equal(response.roleName, "evidence_extractor");
  assert.equal(response.usage?.totalTokens, 15);
});

test("provider router redacts unsafe provider errors", async () => {
  const router = new ProviderRouter();
  router.register({
    name: "openrouter",
    complete: async () => {
      throw new Error("bad key sk-or-v1-secret");
    },
  });

  await assert.rejects(
    () => router.complete("openrouter", { model: "x", messages: [{ role: "user", content: "hi" }] }),
    (err) => err instanceof ProviderError && !/sk-or-v1-secret/.test(err.message) && /REDACTED/.test(err.message),
  );
});
