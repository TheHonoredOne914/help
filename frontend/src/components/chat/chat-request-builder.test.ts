import test from "node:test";
import assert from "node:assert/strict";
import { buildChatRequestBody } from "./chat-request-builder";

test("rhetorics request preserves the exact rhetorics body shape", () => {
  assert.deepEqual(buildChatRequestBody({
    content: "opening speech",
    mode: "normal",
    normalModel: "groq/llama",
    activeProviderModel: "groq/llama",
    modelsForMode: ["groq/llama"],
    userSystemPrompt: "ignored",
    rhetoricsOpts: { rhetoricsType: "speech", creativity: 0.7 },
  }), {
    content: "opening speech",
    mode: "rhetorics",
    rhetoricsType: "speech",
    creativity: 0.7,
  });
});

test("normal request preserves normal mode body shape", () => {
  assert.deepEqual(buildChatRequestBody({
    content: "hello",
    mode: "normal",
    normalModel: "groq/llama",
    activeProviderModel: "nvidia/moonshotai/kimi-k2.6",
    modelsForMode: ["nvidia/moonshotai/kimi-k2.6"],
    userSystemPrompt: "",
  }), {
    content: "hello",
    mode: "normal",
    researchMode: undefined,
    modelConfig: "standard",
    normalModel: "groq/llama",
    webModels: undefined,
    autoFallback: false,
    systemPrompt: undefined,
  });
});

test("research request preserves research body shape", () => {
  assert.deepEqual(buildChatRequestBody({
    content: "research",
    mode: "deep_research",
    normalModel: "groq/llama",
    activeProviderModel: "nvidia/moonshotai/kimi-k2.6",
    modelsForMode: ["nvidia/moonshotai/kimi-k2.6", "github/openai/gpt-4.1"],
    userSystemPrompt: "system",
  }), {
    content: "research",
    mode: "deep_research",
    researchMode: "deep_research",
    modelConfig: "standard",
    normalModel: "nvidia/moonshotai/kimi-k2.6",
    webModels: ["nvidia/moonshotai/kimi-k2.6", "github/openai/gpt-4.1"],
    autoFallback: false,
    systemPrompt: "system",
  });
});

test("research request sends explicit autoFallback when enabled", () => {
  assert.equal(buildChatRequestBody({
    content: "research",
    mode: "fast_research",
    normalModel: "groq/llama",
    activeProviderModel: "groq/llama",
    modelsForMode: ["groq/llama"],
    autoFallback: true,
  }).autoFallback, true);
});
