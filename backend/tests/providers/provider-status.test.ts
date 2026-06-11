import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderStatusPayload } from "../../src/routes/providers.js";

test("provider status distinguishes missing and configured providers without leaking keys", async () => {
  const payload = await buildProviderStatusPayload({
    groqKey: null,
    ollamaKey: null,
    ollamaBase: null,
    nvidiaKey: "nvapi-secret",
    geminiKey: null,
    openrouterKey: null,
    githubToken: "gh-secret",
    tavilyKey: null,
    serperKey: null,
    braveKey: null,
    jinaKey: null,
    hfToken: null,
  }, {
    cacheKey: "provider-status-test",
    fetchFn: async () => new Response(JSON.stringify({ data: [{ id: "moonshotai/kimi-k2.6" }] }), { status: 200 }) as any,
  });

  assert.equal(payload.providers.nvidia.configured, true);
  assert.equal(payload.providers.nvidia.healthy, true);
  assert.ok(payload.providers.nvidia.models?.includes("moonshotai/kimi-k2.6"));
  assert.equal(payload.providers.github.configured, true);
  assert.equal(payload.providers.groq.status, "missing_key");
  assert.doesNotMatch(JSON.stringify(payload), /secret/);
});
