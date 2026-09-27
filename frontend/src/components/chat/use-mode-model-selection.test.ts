import test from "node:test";
import assert from "node:assert/strict";
import {
  pickAutoModels,
  repairModeModelSelection,
  resolveModeModelSelection,
  resolvePresetModels,
  type ModeModelSelectionState,
} from "./use-mode-model-selection";

const state: ModeModelSelectionState = {
  normalModel: "groq/openai/gpt-oss-120b",
  webSearchModels: ["groq/openai/gpt-oss-120b", "github/openai/gpt-4.1"],
  deepResearchModels: ["openrouter/anthropic/claude-sonnet-4.5"],
};

test("mode model selection keeps fast separate from deep/phd/full modes", () => {
  assert.deepEqual(resolveModeModelSelection("normal", state), ["groq/openai/gpt-oss-120b"]);
  assert.deepEqual(resolveModeModelSelection("fast_research", state), state.webSearchModels);
  assert.deepEqual(resolveModeModelSelection("deep_research", state), state.deepResearchModels);
  assert.deepEqual(resolveModeModelSelection("deep_research", state), state.deepResearchModels);
  assert.deepEqual(resolveModeModelSelection("council", state), state.deepResearchModels);
});

test("mode model repair removes stale selections without preferring NVIDIA Kimi", () => {
  const repaired = repairModeModelSelection(
    {
      normalModel: "groq/missing",
      webSearchModels: ["groq/missing", "github/openai/gpt-4.1"],
      deepResearchModels: ["openrouter/missing"],
    },
    ["github/openai/gpt-4.1", "nvidia/moonshotai/kimi-k2.6"],
  );

  assert.deepEqual(repaired, {
    normalModel: "github/openai/gpt-4.1",
    webSearchModels: ["github/openai/gpt-4.1"],
    deepResearchModels: ["github/openai/gpt-4.1"],
  });
});

test("mode model repair replaces known unstable saved research models", () => {
  const repaired = repairModeModelSelection(
    {
      normalModel: "groq/openai/gpt-oss-120b",
      webSearchModels: ["nvidia/moonshotai/kimi-k2.6"],
      deepResearchModels: ["openrouter/nvidia/nemotron-3-ultra-550b-a55b"],
    },
    [
      "groq/openai/gpt-oss-120b",
      "nvidia/moonshotai/kimi-k2.6",
      "openrouter/nvidia/nemotron-3-ultra-550b-a55b",
    ],
  );

  assert.deepEqual(repaired.webSearchModels, ["groq/openai/gpt-oss-120b"]);
  assert.deepEqual(repaired.deepResearchModels, ["groq/openai/gpt-oss-120b"]);
});

test("mode model repair replaces llama 3.3 versatile", () => {
  const repaired = repairModeModelSelection(
    {
      normalModel: "groq/llama-3.3-70b-versatile",
      webSearchModels: ["groq/llama-3.3-70b-versatile"],
      deepResearchModels: ["groq/llama-3.3-70b-versatile"],
    },
    ["groq/openai/gpt-oss-120b", "github/openai/gpt-4.1"],
  );
  assert.equal(repaired.normalModel, "groq/openai/gpt-oss-120b");
  assert.deepEqual(repaired.webSearchModels, ["groq/openai/gpt-oss-120b"]);
});

test("mode model repair preserves selections when no research-usable providers exist", () => {
  assert.deepEqual(repairModeModelSelection(state, []), state);
});

test("auto pick round-robins across providers instead of stacking one", () => {
  const healthy = [
    "groq/openai/gpt-oss-120b",
    "groq/llama-3.1-8b-instant",
    "gemini/gemini-2.0-flash",
    "nvidia/moonshotai/kimi-k2.5",
  ];
  assert.deepEqual(pickAutoModels(healthy, 2), [
    "groq/openai/gpt-oss-120b",
    "gemini/gemini-2.0-flash",
  ]);
  assert.deepEqual(pickAutoModels(healthy, 3), [
    "groq/openai/gpt-oss-120b",
    "gemini/gemini-2.0-flash",
    "nvidia/moonshotai/kimi-k2.5",
  ]);
});

test("auto pick caps at available models and skips known unstable ones", () => {
  assert.deepEqual(pickAutoModels(["groq/openai/gpt-oss-120b"], 4), ["groq/openai/gpt-oss-120b"]);
  assert.deepEqual(pickAutoModels([], 2), []);
  assert.deepEqual(
    pickAutoModels(["nvidia/moonshotai/kimi-k2.6", "groq/openai/gpt-oss-120b"], 2),
    ["groq/openai/gpt-oss-120b"],
  );
});

test("presets resolve to model counts without manual selection", () => {
  const healthy = [
    "groq/openai/gpt-oss-120b",
    "gemini/gemini-2.0-flash",
    "nvidia/moonshotai/kimi-k2.5",
    "openrouter/anthropic/claude-sonnet-4.5",
    "github/openai/gpt-4.1",
  ];
  assert.equal(resolvePresetModels("solo", healthy).length, 1);
  assert.equal(resolvePresetModels("balanced", healthy).length, 2);
  assert.equal(resolvePresetModels("max", healthy).length, 4);
  assert.deepEqual(resolvePresetModels("max", []), []);
  assert.deepEqual(resolvePresetModels("unknown-preset", healthy), []);
});
