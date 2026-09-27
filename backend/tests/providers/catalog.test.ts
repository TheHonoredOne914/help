import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NATIVE_MODELS,
  FAST_FALLBACK_MODELS,
  GROQ_CATALOG,
  OPENCODE_ZEN_MODELS_CATALOG,
  OPENROUTER_CATALOG,
  ROLE_FALLBACK_MODELS,
  STRONG_FALLBACK_MODELS,
  buildPrefixedModelId,
  isOpenCodeZenFreeModel,
  isOpenRouterFreeListedModel,
  isUnsupportedListedModel,
  remapUnavailableGroqModelId,
} from "../../src/core/providers/catalog/index.js";

test("remapUnavailableGroqModelId rewrites decommissioned llama-3.3-70b-versatile", () => {
  assert.equal(remapUnavailableGroqModelId("groq/llama-3.3-70b-versatile"), "groq/openai/gpt-oss-120b");
  assert.equal(remapUnavailableGroqModelId("llama-3.3-70b-versatile"), "openai/gpt-oss-120b");
  assert.equal(remapUnavailableGroqModelId("groq/openai/gpt-oss-120b"), "groq/openai/gpt-oss-120b");
});

test("isOpenCodeZenFreeModel matches the free catalog, not every -free substring", () => {
  assert.equal(isOpenCodeZenFreeModel("big-pickle"), true);
  assert.equal(isOpenCodeZenFreeModel("nemotron-3-ultra-free"), true);
  assert.equal(isOpenCodeZenFreeModel("muse-spark-1.3-contributor-free"), true);
  assert.equal(isOpenCodeZenFreeModel("not-a-real-model-free"), false);
  assert.equal(isOpenCodeZenFreeModel("paid-preview-free-tier"), false);
  assert.equal(isOpenCodeZenFreeModel(""), false);
});

test("isOpenRouterFreeListedModel keeps :free and zero-price ids", () => {
  assert.equal(isOpenRouterFreeListedModel("qwen/qwen3-32b:free"), true);
  assert.equal(isOpenRouterFreeListedModel("openai/gpt-4o-mini", { prompt: "0", completion: "0" }), true);
  assert.equal(isOpenRouterFreeListedModel("anthropic/claude-sonnet-4.5"), false);
  assert.equal(isOpenRouterFreeListedModel("openai/gpt-4o-mini", { prompt: "0.00015", completion: "0.0006" }), false);
});

test("display catalogs encode static listing policy", () => {
  assert.ok(OPENROUTER_CATALOG.length > 0);
  assert.ok(OPENROUTER_CATALOG.every((model) => isOpenRouterFreeListedModel(model.id)));
  assert.ok(GROQ_CATALOG.every((model) => !isUnsupportedListedModel(model.id)));
  assert.ok(OPENCODE_ZEN_MODELS_CATALOG.every((model) => model.ownedBy === "opencode"));
  assert.equal(buildPrefixedModelId("openrouter", "qwen/qwen3-32b:free"), "openrouter/qwen/qwen3-32b:free");
});

test("default and fallback native ids stay on free OpenRouter and remapped Groq", () => {
  assert.equal(DEFAULT_NATIVE_MODELS.groq, "openai/gpt-oss-120b");
  assert.equal(DEFAULT_NATIVE_MODELS.openrouter, "qwen/qwen3-32b:free");
  for (const model of [...STRONG_FALLBACK_MODELS, ...FAST_FALLBACK_MODELS, ...ROLE_FALLBACK_MODELS]) {
    if (model.providerName === "openrouter") {
      assert.equal(isOpenRouterFreeListedModel(model.model), true);
    }
    if (model.providerName === "groq") {
      assert.equal(isUnsupportedListedModel(model.model), false);
    }
  }
});
