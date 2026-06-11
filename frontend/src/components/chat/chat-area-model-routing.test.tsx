import test from "node:test";
import assert from "node:assert/strict";
import { getModelsForMode, getPrimaryModelForMode, type ChatMode } from "./chat-model-routing";

const normalModel = "groq/llama-3.3-70b-versatile";
const webSearchModels = ["nvidia/moonshotai/kimi-k2.6", "groq/llama-3.3-70b-versatile"];
const deepResearchModels = ["openrouter/anthropic/claude-sonnet-4.5", "github/openai/gpt-4.1"];

test("normal mode uses normalModel", () => {
  assert.deepEqual(getModelsForMode("normal", normalModel, webSearchModels, deepResearchModels), [normalModel]);
  assert.equal(getPrimaryModelForMode("normal", normalModel, webSearchModels, deepResearchModels), normalModel);
});

test("fast and web research use webSearchModels", () => {
  for (const mode of ["fast_research", "web_search"] as Array<ChatMode | "web_search">) {
    assert.deepEqual(getModelsForMode(mode, normalModel, webSearchModels, deepResearchModels), webSearchModels);
    assert.equal(getPrimaryModelForMode(mode, normalModel, webSearchModels, deepResearchModels), webSearchModels[0]);
  }
});

test("deep and Council use deepResearchModels", () => {
  for (const mode of ["deep_research", "council"] as ChatMode[]) {
    assert.deepEqual(getModelsForMode(mode, normalModel, webSearchModels, deepResearchModels), deepResearchModels);
    assert.equal(getPrimaryModelForMode(mode, normalModel, webSearchModels, deepResearchModels), deepResearchModels[0]);
  }
});

test("empty selected research list falls back to normalModel", () => {
  assert.equal(getPrimaryModelForMode("fast_research", normalModel, [], deepResearchModels), normalModel);
  assert.equal(getPrimaryModelForMode("deep_research", normalModel, webSearchModels, []), normalModel);
});
