import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { checkPromptBudget } from "../../../src/core/providers/limits/prompt-budget-gate.js";
import type { PromptBudget } from "../../../src/core/generation/prompt-budget.js";

describe("checkPromptBudget", () => {
  const makeBudget = (maxInput: number, maxOutput: number): PromptBudget => ({
    maxInputTokens: maxInput,
    maxOutputTokens: maxOutput,
    maxSources: 30,
    maxCharsPerSource: 2000,
  });

  it("should recommend skip when NVIDIA estimatedInputTokens exceeds safe budget", () => {
    const result = checkPromptBudget(
      "nvidia",
      "moonshotai/kimi-k2.6",
      9373,
      makeBudget(48_000, 7_000),
    );
    assert.equal(result.recommendation, "skip");
    assert.equal(result.wouldExceed, true);
    assert.equal(result.safeInputBudget, 7_820);
    assert.equal(result.providerMaxInputTokens, 9_200);
  });

  it("should recommend proceed when Gemini prompt is well within budget", () => {
    const result = checkPromptBudget(
      "gemini",
      "gemini-2.5-pro",
      50_000,
      makeBudget(200_000, 8_000),
    );
    assert.equal(result.recommendation, "proceed");
    assert.equal(result.wouldExceed, false);
  });

  it("should recommend compress when between safe and max budget", () => {
    const result = checkPromptBudget(
      "nvidia",
      "moonshotai/kimi-k2.6",
      8_500,
      makeBudget(48_000, 7_000),
    );
    assert.equal(result.recommendation, "compress");
    assert.equal(result.wouldExceed, true);
    assert.ok(result.estimatedInputTokens <= result.providerMaxInputTokens);
  });

  it("should use Groq model-specific limits when model is specified", () => {
    const result = checkPromptBudget(
      "groq",
      "llama-3.3-70b-versatile",
      8_000,
      makeBudget(32_000, 4_096),
    );
    assert.equal(result.recommendation, "proceed");
    assert.equal(result.safeInputBudget, 9_000);
  });

  it("should fall back to provider defaults when model is not specified", () => {
    const result = checkPromptBudget(
      "groq",
      "unknown-model",
      20_000,
      makeBudget(32_000, 4_096),
    );
    assert.equal(result.recommendation, "proceed");
    assert.equal(result.safeInputBudget, 27_200);
  });
});
