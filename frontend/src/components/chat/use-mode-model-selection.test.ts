import test from "node:test";
import assert from "node:assert/strict";
import {
  repairModeModelSelection,
  resolveModeModelSelection,
  type ModeModelSelectionState,
} from "./use-mode-model-selection";

const state: ModeModelSelectionState = {
  normalModel: "groq/llama-3.3-70b-versatile",
  webSearchModels: ["groq/llama-3.3-70b-versatile", "github/openai/gpt-4.1"],
  deepResearchModels: ["openrouter/anthropic/claude-sonnet-4.5"],
};

test("mode model selection keeps fast separate from deep/phd/full modes", () => {
  assert.deepEqual(resolveModeModelSelection("normal", state), ["groq/llama-3.3-70b-versatile"]);
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
      normalModel: "groq/llama-3.3-70b-versatile",
      webSearchModels: ["nvidia/moonshotai/kimi-k2.6"],
      deepResearchModels: ["openrouter/nvidia/nemotron-3-ultra-550b-a55b"],
    },
    [
      "groq/llama-3.3-70b-versatile",
      "nvidia/moonshotai/kimi-k2.6",
      "openrouter/nvidia/nemotron-3-ultra-550b-a55b",
    ],
  );

  assert.deepEqual(repaired.webSearchModels, ["groq/llama-3.3-70b-versatile"]);
  assert.deepEqual(repaired.deepResearchModels, ["groq/llama-3.3-70b-versatile"]);
});

test("mode model repair preserves selections when no research-usable providers exist", () => {
  assert.deepEqual(repairModeModelSelection(state, []), state);
});
