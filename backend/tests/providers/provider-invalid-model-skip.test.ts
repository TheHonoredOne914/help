import test from "node:test";
import assert from "node:assert/strict";
import { safeProviderErrorReport } from "../../src/core/providers/provider-errors.js";
import { createProviderRunState } from "../../src/core/providers/provider-run-state.js";

test("provider model/provider 404 is classified as invalid_model", () => {
  for (const error of [
    { status: 404, message: "model not found" },
    new Error("provider not found for model openrouter/bad-model"),
    new Error("No endpoints found for model"),
  ]) {
    const report = safeProviderErrorReport("openrouter", error);
    assert.equal(report.code, "invalid_model");
    assert.equal(report.retryable, false);
  }
});

test("invalid_model skips only the exact provider model inside a run", () => {
  const state = createProviderRunState(() => 10_000);

  state.recordFailure("openrouter", { code: "invalid_model", status: 404 }, { model: "bad/model" });

  assert.equal(state.shouldSkipModel("openrouter", "bad/model"), true);
  assert.equal(state.shouldSkipModel("openrouter", "good/model:free"), false);
  assert.equal(state.shouldSkipModel("gemini", "bad/model"), false);
});
