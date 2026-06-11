import test from "node:test";
import assert from "node:assert/strict";
import { NvidiaProvider } from "../../src/core/providers/nvidia-provider.js";
import { ProviderRouter } from "../../src/core/providers/provider-router.js";
import { buildCoreProviderRouter } from "../../src/services/anthropic-service.js";

test("NVIDIA provider sends OpenAI-compatible chat completions request", async () => {
  let seenUrl = "";
  let body: any;
  const provider = new NvidiaProvider({
    apiKey: "nvapi-secret",
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const router = new ProviderRouter();
  router.register(provider);
  const result = await router.completeJson("nvidia", {
    model: "moonshotai/kimi-k2.6",
    messages: [{ role: "user", content: "Return JSON." }],
    metadata: { responseFormat: "json" },
  });

  assert.equal(seenUrl, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(body.model, "moonshotai/kimi-k2.6");
  assert.deepEqual(result.json, { ok: true });
  assert.equal(result.usage?.totalTokens, 7);
});

test("buildCoreProviderRouter routes nvidia/moonshotai/kimi-k2.6 to NVIDIA native id", () => {
  const core = buildCoreProviderRouter({
    groqKey: null,
    ollamaKey: null,
    ollamaBase: null,
    nvidiaKey: "nvapi-secret",
    geminiKey: null,
    openrouterKey: null,
    githubToken: null,
    tavilyKey: null,
    serperKey: null,
    braveKey: null,
    jinaKey: null,
    hfToken: null,
  }, "nvidia/moonshotai/kimi-k2.6");

  assert.equal(core.providerName, "nvidia");
  assert.equal(core.model, "moonshotai/kimi-k2.6");
  assert.equal(core.router?.hasProvider("nvidia"), true);
});
