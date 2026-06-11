import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { checkPromptBudget } from "../../src/core/providers/limits/prompt-budget-gate.js";
import type { PromptBudget } from "../../src/core/generation/prompt-budget.js";

describe("prompt budget gate integration", () => {
  const makeBudget = (maxInput: number, maxOutput: number): PromptBudget => ({
    maxInputTokens: maxInput,
    maxOutputTokens: maxOutput,
    maxSources: 30,
    maxCharsPerSource: 2000,
  });

  it("should skip NVIDIA when prompt exceeds safe budget (real-world scenario)", () => {
    // Simulating the actual failure case: 9373 tokens vs 7820 safe budget
    const result = checkPromptBudget(
      "nvidia",
      "moonshotai/kimi-k2.6",
      9373,
      makeBudget(48_000, 7_000),
    );
    assert.equal(result.recommendation, "skip");
    assert.equal(result.providerName, "nvidia");
    assert.ok(result.safeInputBudget <= 7820);
  });

  it("should proceed with Groq for small prompts", () => {
    const result = checkPromptBudget(
      "groq",
      "llama-3.3-70b-versatile",
      5000,
      makeBudget(32_000, 4_096),
    );
    assert.equal(result.recommendation, "proceed");
  });

  it("should suggest compression for Gemini with medium prompts", () => {
    const result = checkPromptBudget(
      "gemini",
      "gemini-2.5-pro",
      180_000,
      makeBudget(200_000, 8_000),
    );
    // 180K > 170K safe budget but < 200K max, so compress
    assert.equal(result.recommendation, "compress");
  });

  it("should skip Cerebras for large prompts", () => {
    const result = checkPromptBudget(
      "cerebras",
      "llama3.3-70b",
      10_000,
      makeBudget(10_000, 4_096),
    );
    assert.equal(result.recommendation, "skip");
    assert.equal(result.providerMaxInputTokens, 8_000);
    assert.equal(result.safeInputBudget, 6_800);
  });
});
