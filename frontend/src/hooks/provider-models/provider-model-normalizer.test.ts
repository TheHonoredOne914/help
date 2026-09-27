import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthyResearchModels, buildSelectableResearchModels, normalizeProviderModels } from "./provider-model-normalizer";
import type { ProviderModels, ProviderStatusMap } from "./provider-types";

test("Groq native ID becomes groq/<id>", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { groq: healthy("groq") } as ProviderStatusMap,
      { groq: normalizeProviderModels("groq", ["openai/gpt-oss-120b"]) } as ProviderModels,
    ),
    ["groq/openai/gpt-oss-120b"],
  );
});

test("Groq catalog fallback models remain selectable for explicit user choice", () => {
  assert.deepEqual(
    buildSelectableResearchModels(
      {
        groq: {
          provider: "groq",
          configured: true,
          healthy: false,
          checking: false,
          status: "catalog_fallback",
          source: "catalog_fallback",
          modelCount: 1,
          canListModels: true,
          chatVerified: false,
          catalogFallbackOnly: true,
        },
      } as ProviderStatusMap,
      { groq: normalizeProviderModels("groq", ["openai/gpt-oss-120b"]) } as ProviderModels,
    ),
    ["groq/openai/gpt-oss-120b"],
  );
});

test("already-prefixed Groq ID is not double-prefixed", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { groq: healthy("groq") } as ProviderStatusMap,
      { groq: normalizeProviderModels("groq", ["groq/openai/gpt-oss-120b"]) } as ProviderModels,
    ),
    ["groq/openai/gpt-oss-120b"],
  );
});

test("known-unavailable Groq llama 3.3 is dropped from selectable lists", () => {
  assert.deepEqual(
    normalizeProviderModels("groq", ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]),
    [{ id: "openai/gpt-oss-120b" }],
  );
  assert.deepEqual(
    buildHealthyResearchModels(
      { groq: healthy("groq") } as ProviderStatusMap,
      { groq: normalizeProviderModels("groq", ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]) } as ProviderModels,
    ),
    ["groq/openai/gpt-oss-120b"],
  );
});

test("stale NVIDIA kimi-k2.6 is dropped from selectable lists", () => {
  assert.deepEqual(normalizeProviderModels("nvidia", [{ id: "moonshotai/kimi-k2.6" }]), []);
});

test("NVIDIA nested path is preserved for supported models", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { nvidia: healthy("nvidia") } as ProviderStatusMap,
      { nvidia: normalizeProviderModels("nvidia", [{ id: "meta/llama-3.1-8b-instruct" }]) } as ProviderModels,
    ),
    ["nvidia/meta/llama-3.1-8b-instruct"],
  );
});

test("OpenRouter nested IDs preserve nested path", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { openrouter: healthy("openrouter") } as ProviderStatusMap,
      { openrouter: normalizeProviderModels("openrouter", [{ id: "qwen/qwen3-32b:free" }]) } as ProviderModels,
    ),
    ["openrouter/qwen/qwen3-32b:free"],
  );
});

test("OpenRouter paid models are dropped from selectable lists", () => {
  assert.deepEqual(
    normalizeProviderModels("openrouter", [
      { id: "anthropic/claude-sonnet-4.5" },
      { id: "qwen/qwen3-32b:free" },
      { id: "meta-llama/llama-3.1-8b-instruct", badge: "free" },
    ]).map((model) => model.id),
    ["qwen/qwen3-32b:free", "meta-llama/llama-3.1-8b-instruct"],
  );
});

test("duplicate models are removed", () => {
  const models = normalizeProviderModels("github", [
    "openai/gpt-4.1",
    { id: "github/openai/gpt-4.1", name: "GPT 4.1" },
    { id: "openai/gpt-4.1", name: "duplicate" },
  ]);

  assert.deepEqual(models.map((model) => model.id), ["openai/gpt-4.1"]);
});

function healthy(provider: string) {
  return {
    provider,
    configured: true,
    healthy: true,
    checking: false,
    status: "healthy",
    modelCount: 1,
    canChat: true,
  };
}
