import test from "node:test";
import assert from "node:assert/strict";
import { buildPrefixedModelId, GITHUB_MODELS_CATALOG, listGithubModels } from "../../src/routes/providers.js";

test("GitHub Models catalog includes starter models", async () => {
  const payload = await listGithubModels("gh-token", async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }) as any);
  assert.equal(payload.provider, "github");
  assert.equal(payload.source, "catalog_fallback");
  assert.equal(payload.healthy, false);
  assert.equal(payload.canChat, false);
  assert.equal(payload.chatVerified, false);
  assert.ok(payload.models.some((model) => model.id === "openai/gpt-4.1"));
  assert.ok(GITHUB_MODELS_CATALOG.some((model) => model.id === "deepseek/deepseek-r1"));
});

test("GitHub frontend model id keeps provider-native org prefix", () => {
  assert.equal(buildPrefixedModelId("github", "openai/gpt-4.1"), "github/openai/gpt-4.1");
});

test("GitHub model list requires a token", async () => {
  await assert.rejects(() => listGithubModels(null), /GitHub Models token is not configured/);
});
