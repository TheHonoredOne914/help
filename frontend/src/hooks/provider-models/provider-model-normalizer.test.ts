import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthyResearchModels, buildSelectableResearchModels, normalizeProviderModels } from "./provider-model-normalizer";
import type { ProviderModels, ProviderStatusMap } from "./provider-types";

test("Groq native ID becomes groq/<id>", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { groq: healthy("groq") } as ProviderStatusMap,
      { groq: normalizeProviderModels("groq", ["llama-3.3-70b-versatile"]) } as ProviderModels,
    ),
    ["groq/llama-3.3-70b-versatile"],
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
      { groq: normalizeProviderModels("groq", ["llama-3.3-70b-versatile"]) } as ProviderModels,
    ),
    ["groq/llama-3.3-70b-versatile"],
  );
});

test("already-prefixed Groq ID is not double-prefixed", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { groq: healthy("groq") } as ProviderStatusMap,
      { groq: normalizeProviderModels("groq", ["groq/llama-3.3-70b-versatile"]) } as ProviderModels,
    ),
    ["groq/llama-3.3-70b-versatile"],
  );
});

test("NVIDIA moonshotai/kimi-k2.6 preserves nested path", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { nvidia: healthy("nvidia") } as ProviderStatusMap,
      { nvidia: normalizeProviderModels("nvidia", [{ id: "moonshotai/kimi-k2.6" }]) } as ProviderModels,
    ),
    ["nvidia/moonshotai/kimi-k2.6"],
  );
});

test("OpenRouter nested IDs preserve nested path", () => {
  assert.deepEqual(
    buildHealthyResearchModels(
      { openrouter: healthy("openrouter") } as ProviderStatusMap,
      { openrouter: normalizeProviderModels("openrouter", [{ id: "anthropic/claude-sonnet-4.5" }]) } as ProviderModels,
    ),
    ["openrouter/anthropic/claude-sonnet-4.5"],
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
