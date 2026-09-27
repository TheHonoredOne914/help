import test from "node:test";
import assert from "node:assert/strict";
import { isOpenRouterFreeListedModel, OPENROUTER_CATALOG } from "../../src/routes/providers.js";
import { buildCoreProviderRouter } from "../../src/services/anthropic/core-provider-router.js";

test("OpenRouter free filter keeps :free and zero-price ids", () => {
  assert.equal(isOpenRouterFreeListedModel("qwen/qwen3-32b:free"), true);
  assert.equal(isOpenRouterFreeListedModel("openai/gpt-4o-mini", { prompt: "0", completion: "0" }), true);
  assert.equal(isOpenRouterFreeListedModel("anthropic/claude-sonnet-4.5"), false);
  assert.equal(isOpenRouterFreeListedModel("openai/gpt-4o-mini", { prompt: "0.00015", completion: "0.0006" }), false);
});

test("OpenRouter fallback catalog only contains free models", () => {
  assert.ok(OPENROUTER_CATALOG.length > 0);
  assert.ok(OPENROUTER_CATALOG.every((model) => isOpenRouterFreeListedModel(model.id)));
});

test("buildCoreProviderRouter rejects paid OpenRouter models", () => {
  const keys = { openrouterKey: "sk-or-test" };
  const paid = buildCoreProviderRouter(keys, "openrouter/anthropic/claude-sonnet-4.5");
  assert.match(paid.error ?? "", /free models/i);
  const free = buildCoreProviderRouter(keys, "openrouter/qwen/qwen3-32b:free");
  assert.equal(free.error, undefined);
  assert.equal(free.providerName, "openrouter");
  assert.equal(free.model, "qwen/qwen3-32b:free");
});

