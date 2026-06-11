import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreProviderRouter } from "../../src/services/anthropic-service.js";

const baseKeys = {
  groqKey: null,
  ollamaKey: null,
  ollamaBase: null,
  nvidiaKey: null,
  geminiKey: null,
  openrouterKey: null,
  githubToken: null,
  tavilyKey: null,
  serperKey: null,
  braveKey: null,
  jinaKey: null,
  hfToken: null,
};

test("core provider router accepts Kimi under NVIDIA", () => {
  const result = buildCoreProviderRouter({ ...baseKeys, nvidiaKey: "nvapi" }, "nvidia/moonshotai/kimi-k2.6");
  assert.equal(result.error, undefined);
  assert.equal(result.providerName, "nvidia");
  assert.equal(result.model, "moonshotai/kimi-k2.6");
});

test("core provider router accepts GitHub Models", () => {
  const result = buildCoreProviderRouter({ ...baseKeys, githubToken: "gh" }, "github/openai/gpt-4.1");
  assert.equal(result.error, undefined);
  assert.equal(result.providerName, "github");
  assert.equal(result.model, "openai/gpt-4.1");
});

test("unavailable providers are rejected before core pipeline work starts", () => {
  assert.match(buildCoreProviderRouter(baseKeys, "nvidia/moonshotai/kimi-k2.6").error ?? "", /missing API key/i);
  assert.match(buildCoreProviderRouter(baseKeys, "github/openai/gpt-4.1").error ?? "", /missing token/i);
});
