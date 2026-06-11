import test from "node:test";
import assert from "node:assert/strict";
import { GithubProvider } from "../../src/core/providers/github-provider.js";
import { ProviderRouter } from "../../src/core/providers/provider-router.js";
import { buildCoreProviderRouter } from "../../src/services/anthropic-service.js";
import { extractKeys } from "../../src/lib/provider-router.js";

test("GitHub provider sends request to GitHub Models endpoint", async () => {
  let seenUrl = "";
  let auth = "";
  const provider = new GithubProvider({
    apiKey: "gh-token",
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      auth = String((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 5, total_tokens: 7 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const router = new ProviderRouter();
  router.register(provider);
  const result = await router.completeJson("github", {
    model: "openai/gpt-4.1",
    messages: [{ role: "user", content: "JSON" }],
  });

  assert.equal(seenUrl, "https://models.github.ai/inference/chat/completions");
  assert.equal(auth, "Bearer gh-token");
  assert.deepEqual(result.json, { ok: true });
});

test("GitHub model headers are extracted and core routing strips only provider prefix", () => {
  const keys = extractKeys({ headers: { "x-github-models-api-key": " gh-token " } });
  assert.equal(keys.githubToken, "gh-token");
  const core = buildCoreProviderRouter(keys, "github/openai/gpt-4.1");
  assert.equal(core.providerName, "github");
  assert.equal(core.model, "openai/gpt-4.1");
  assert.equal(core.router?.hasProvider("github"), true);
});
