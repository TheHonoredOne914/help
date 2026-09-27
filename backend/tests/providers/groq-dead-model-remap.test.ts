import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreProviderRouter } from "../../src/services/anthropic-service.js";
import { remapUnavailableGroqModelId } from "../../src/services/anthropic/message-preflight.js";

const keys = {
  groqKey: "gsk-test",
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

test("remapUnavailableGroqModelId rewrites decommissioned llama-3.3-70b-versatile", () => {
  assert.equal(remapUnavailableGroqModelId("groq/llama-3.3-70b-versatile"), "groq/openai/gpt-oss-120b");
  assert.equal(remapUnavailableGroqModelId("llama-3.3-70b-versatile"), "openai/gpt-oss-120b");
  assert.equal(remapUnavailableGroqModelId("groq/openai/gpt-oss-120b"), "groq/openai/gpt-oss-120b");
});

test("buildCoreProviderRouter remaps dead Groq llama-3.3 for council and research", () => {
  const core = buildCoreProviderRouter(keys, "groq/llama-3.3-70b-versatile");
  assert.equal(core.providerName, "groq");
  assert.equal(core.model, "openai/gpt-oss-120b");
  assert.equal(core.error, undefined);
});
