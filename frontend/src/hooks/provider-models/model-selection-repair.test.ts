import test from "node:test";
import assert from "node:assert/strict";
import { repairSelectedModel, repairSelectedModelList } from "./model-selection-repair";

test("valid selected model is preserved", () => {
  assert.equal(
    repairSelectedModel("github/openai/gpt-4.1", ["github/openai/gpt-4.1", "nvidia/moonshotai/kimi-k2.6"]),
    "github/openai/gpt-4.1",
  );
});

test("invalid list repairs to exactly one preferred model", () => {
  assert.deepEqual(
    repairSelectedModelList(["groq/missing"], ["openrouter/anthropic/claude-sonnet-4.5", "github/openai/gpt-4.1"]),
    ["openrouter/anthropic/claude-sonnet-4.5"],
  );
});

test("duplicate selections are deduped", () => {
  assert.deepEqual(
    repairSelectedModelList(
      ["github/openai/gpt-4.1", "github/openai/gpt-4.1", "nvidia/moonshotai/kimi-k2.6"],
      ["github/openai/gpt-4.1", "nvidia/moonshotai/kimi-k2.6"],
    ),
    ["github/openai/gpt-4.1", "nvidia/moonshotai/kimi-k2.6"],
  );
});

test("empty healthyResearchModels preserves original list", () => {
  assert.deepEqual(repairSelectedModelList(["groq/missing", "groq/missing"], []), ["groq/missing", "groq/missing"]);
  assert.equal(repairSelectedModel("groq/missing", []), null);
});

test("mixed valid and invalid keeps only valid models", () => {
  assert.deepEqual(
    repairSelectedModelList(["groq/missing", "github/openai/gpt-4.1"], ["github/openai/gpt-4.1"]),
    ["github/openai/gpt-4.1"],
  );
});

test("repair does not globally prefer NVIDIA Kimi", () => {
  assert.deepEqual(
    repairSelectedModelList(["groq/missing"], ["github/openai/gpt-4.1", "nvidia/moonshotai/kimi-k2.6"]),
    ["github/openai/gpt-4.1"],
  );
  assert.deepEqual(
    repairSelectedModelList(["groq/missing"], ["github/openai/gpt-4.1"]),
    ["github/openai/gpt-4.1"],
  );
});

test("current user-selected provider is preserved when catalog fallback still has models", () => {
  assert.equal(
    repairSelectedModel("groq/llama-3.3-70b-versatile", ["nvidia/moonshotai/kimi-k2.6"], {
      providerStatusByName: {
        groq: { configured: true, status: "catalog_fallback", catalogFallbackOnly: true, modelCount: 5 },
      },
    }),
    "groq/llama-3.3-70b-versatile",
  );
});
