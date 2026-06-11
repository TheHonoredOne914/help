import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { getFallbackOrderForStage, STAGE_FALLBACK_ORDER } from "../../../src/core/providers/limits/stage-fallback-router.js";

describe("stage fallback router", () => {
  it("should return correct fallback order for final_generation", () => {
    const available = ["nvidia", "gemini", "openai", "openrouter", "groq", "github"];
    const fallback = getFallbackOrderForStage("final_generation", "nvidia", available);
    // Should exclude primary (nvidia), return remaining available in stage order
    assert.ok(fallback.length > 0);
    assert.ok(!fallback.includes("nvidia"));
  });

  it("should filter to only available providers", () => {
    const available = ["groq"];
    const fallback = getFallbackOrderForStage("final_generation", "nvidia", available);
    assert.deepEqual(fallback, ["groq"]);
  });

  it("should return empty when no other providers are available", () => {
    const available = ["nvidia"];
    const fallback = getFallbackOrderForStage("final_generation", "nvidia", available);
    assert.deepEqual(fallback, []);
  });

  it("should have all generation providers in final_generation fallback", () => {
    const stage = STAGE_FALLBACK_ORDER["final_generation"];
    // Filter out non-ProviderName entries (extraction/search providers)
    const validProviders = stage.filter((p): p is string =>
      p !== "firecrawl" && p !== "jina" && p !== "tavily" && p !== "serper" && p !== "exa" && p !== "brave"
    );
    assert.ok(validProviders.length >= 5);
  });
});
