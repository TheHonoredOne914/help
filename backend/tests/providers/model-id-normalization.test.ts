import test from "node:test";
import assert from "node:assert/strict";
import { parseProviderModelId, SUPPORTED_PROVIDER_PREFIXES } from "../../src/lib/provider-router.js";

test("provider/model normalization keeps nested provider-native ids intact", () => {
  assert.deepEqual(parseProviderModelId("nvidia/moonshotai/kimi-k2.6"), {
    prefix: "nvidia",
    modelId: "moonshotai/kimi-k2.6",
  });
  assert.deepEqual(parseProviderModelId("github/openai/gpt-4.1"), {
    prefix: "github",
    modelId: "openai/gpt-4.1",
  });
  assert.deepEqual(parseProviderModelId("openrouter/anthropic/claude-sonnet-4.5"), {
    prefix: "openrouter",
    modelId: "anthropic/claude-sonnet-4.5",
  });
});

test("provider prefix registry includes NVIDIA and GitHub", () => {
  assert.ok(SUPPORTED_PROVIDER_PREFIXES.includes("nvidia"));
  assert.ok(SUPPORTED_PROVIDER_PREFIXES.includes("github"));
});
