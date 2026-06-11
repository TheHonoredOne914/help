import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderError } from "../../src/core/run-state/error-taxonomy.js";

test("provider error taxonomy exposes safe user-visible details", () => {
  assert.deepEqual(normalizeProviderError({
    provider: "nvidia",
    model: "moonshotai/kimi-k2.6",
    status: 429,
    code: "RATE_LIMIT",
    message: "Rate limit exceeded",
    stage: "generation",
    retryable: true,
  }), {
    provider: "nvidia",
    model: "moonshotai/kimi-k2.6",
    httpStatus: 429,
    code: "RATE_LIMIT",
    message: "Rate limit exceeded",
    stage: "generation",
    retryable: true,
  });
});
