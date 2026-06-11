import test from "node:test";
import assert from "node:assert/strict";
import { parseProviderModelId, stripProviderPrefix } from "../../src/core/providers/provider-model-id.js";

test("provider model ID routing strips only the first provider prefix", () => {
  assert.deepEqual(parseProviderModelId("nvidia/moonshotai/kimi-k2.6"), {
    prefix: "nvidia",
    modelId: "moonshotai/kimi-k2.6",
  });
  assert.deepEqual(parseProviderModelId("openrouter/anthropic/claude-sonnet-4.5"), {
    prefix: "openrouter",
    modelId: "anthropic/claude-sonnet-4.5",
  });
  assert.deepEqual(parseProviderModelId("github/openai/gpt-4.1"), {
    prefix: "github",
    modelId: "openai/gpt-4.1",
  });
});

test("stripProviderPrefix preserves nested native organization names", () => {
  assert.equal(stripProviderPrefix("nvidia/moonshotai/kimi-k2.6"), "moonshotai/kimi-k2.6");
  assert.equal(stripProviderPrefix("github/openai/gpt-4.1"), "openai/gpt-4.1");
  assert.equal(stripProviderPrefix("openrouter/anthropic/claude-sonnet-4.5"), "anthropic/claude-sonnet-4.5");
});
