import test from "node:test";
import assert from "node:assert/strict";
import { isKnownUnavailableChatModel, getModelBrandKey, getProviderBrandKey, resolveModelBrandKey, isOpenRouterFreeModel } from "./provider-model-display";

test("known-unavailable chat models include dead groq, stale catalogs, and non-chat ids", () => {
  assert.equal(isKnownUnavailableChatModel("groq/llama-3.3-70b-versatile"), true);
  assert.equal(isKnownUnavailableChatModel("llama-3.3-70b-versatile"), true);
  assert.equal(isKnownUnavailableChatModel("moonshotai/kimi-k2.6"), true);
  assert.equal(isKnownUnavailableChatModel("anthropic/claude-3.5-sonnet"), true);
  assert.equal(isKnownUnavailableChatModel("gemini-1.5-pro"), true);
  assert.equal(isKnownUnavailableChatModel("whisper-large-v3"), true);
  assert.equal(isKnownUnavailableChatModel("meta-llama/llama-guard-4-12b"), true);
  assert.equal(isKnownUnavailableChatModel("canopylabs/orpheus-v1-english"), true);
  assert.equal(isKnownUnavailableChatModel("nvidia/llama-3.1-nemoguard-8b-topic-control"), true);
  assert.equal(isKnownUnavailableChatModel("nvidia/llama-3.1-nemotron-safety-guard-8b-v3"), true);
  assert.equal(isKnownUnavailableChatModel("openai/gpt-oss-120b:batch"), true);
  assert.equal(isKnownUnavailableChatModel("openai/gpt-5-image"), true);
  assert.equal(isKnownUnavailableChatModel("meta/llama-3.2-11b-vision-instruct"), true);
  assert.equal(isKnownUnavailableChatModel("openai/gpt-audio"), true);
  assert.equal(isKnownUnavailableChatModel("adept/fuyu-8b"), true);
  assert.equal(isKnownUnavailableChatModel("openai/gpt-oss-120b"), false);
  assert.equal(isKnownUnavailableChatModel("meta-llama/llama-3.3-70b-instruct"), false);
  assert.equal(isKnownUnavailableChatModel("gemini-2.5-flash"), false);
});

test("model brand keys map to actual logo families instead of letter badges", () => {
  assert.equal(getModelBrandKey("openai/gpt-oss-120b"), "openai");
  assert.equal(getModelBrandKey("anthropic/claude-sonnet-4-20250514"), "anthropic");
  assert.equal(getModelBrandKey("gemini-2.5-pro"), "gemini");
  assert.equal(getModelBrandKey("meta-llama/llama-3.1-8b-instant"), "meta");
  assert.equal(getModelBrandKey("qwen/qwen3-32b"), "qwen");
  assert.equal(getProviderBrandKey("Groq"), "groq");
  assert.equal(getProviderBrandKey("NVIDIA"), "nvidia");
  assert.equal(getProviderBrandKey("OpenCode"), "opencode");
  assert.equal(resolveModelBrandKey("allam-2-7b", "Groq"), "groq");
  assert.equal(resolveModelBrandKey("openai/gpt-oss-120b", "Groq"), "openai");
  assert.equal(resolveModelBrandKey("big-pickle", "OpenCode"), "opencode");
});

test("openrouter free ids are detected by :free suffix", () => {
  assert.equal(isOpenRouterFreeModel("qwen/qwen3-32b:free"), true);
  assert.equal(isOpenRouterFreeModel("anthropic/claude-sonnet-4.5"), false);
});
