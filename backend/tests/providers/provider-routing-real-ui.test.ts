import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRouter } from "../../src/core/providers/provider-router.js";
import { OpenRouterProvider } from "../../src/core/providers/openrouter-provider.js";
import { ProviderError } from "../../src/core/providers/provider-errors.js";

test("OpenRouter 401 is surfaced as provider error and not retried as direct Anthropic", async () => {
  const router = new ProviderRouter();
  router.register(new OpenRouterProvider({
    apiKey: "sk-or-v1-secret",
    fetchFn: async () => new Response("bad key sk-or-v1-secret", { status: 401 }),
  }));

  await assert.rejects(() => router.complete("openrouter", {
    model: "anthropic/claude-3.5-sonnet",
    roleName: "core_answer_generator",
    messages: [{ role: "user", content: "test" }],
  }), (error) => error instanceof ProviderError && /401/.test(error.message) && !/sk-or-v1-secret/.test(error.message));
});
