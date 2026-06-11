import test from "node:test";
import assert from "node:assert/strict";
import { ProviderError, classifyProviderError, safeProviderErrorReport } from "../../src/core/providers/provider-errors.js";

test("Groq 429 safe message strips org IDs and billing URLs", () => {
  const error = new ProviderError("Groq 429 org_abc123 see https://console.groq.com/settings/billing retry after 17s sk-secret", "groq", { status: 429 });
  const report = safeProviderErrorReport("groq", error);

  assert.equal(report.code, "rate_limited");
  assert.equal(report.retryable, false);
  assert.match(report.safeMessage, /Groq rate limit reached/i);
  assert.doesNotMatch(report.safeMessage, /org_|billing|sk-secret|https?:/i);
});

test("413 is classified as request_too_large", () => {
  const report = classifyProviderError("groq", new ProviderError("Request too large. Limit 12000 TPM, requested 32468.", "groq", { status: 413 }));
  assert.equal(report.code, "request_too_large");
  assert.equal(report.retryable, false);
});

test("OpenRouter 402 is billing_credits and non-retryable", () => {
  const report = classifyProviderError("openrouter", new ProviderError("OpenRouter 402: insufficient credits", "openrouter", { status: 402 }));

  assert.equal(report.code, "billing_credits");
  assert.equal(report.retryable, false);
  assert.match(report.safeMessage, /credits|billing/i);
});

test("provider HTTP status codes map to typed non-retryable failures", () => {
  assert.equal(classifyProviderError("openrouter", new ProviderError("OpenRouter 404 model not found", "openrouter", { status: 404 })).code, "invalid_model");
  assert.equal(classifyProviderError("nvidia", new ProviderError("NVIDIA 403 forbidden", "nvidia", { status: 403 })).code, "invalid_key");
  assert.equal(classifyProviderError("gemini", new ProviderError("Gemini 502 upstream unavailable", "gemini", { status: 502 })).code, "provider_unavailable");
});

test("UI-safe provider errors do not expose raw provider JSON bodies", () => {
  const report = safeProviderErrorReport(
    "openrouter",
    new ProviderError(
      'OpenRouter 401: {"error":{"message":"bad key sk-provider-secret","metadata":{"raw":"provider-body"}}}',
      "openrouter",
      { status: 401 },
    ),
  );

  assert.equal(report.code, "invalid_key");
  assert.doesNotMatch(report.safeMessage, /sk-provider-secret/);
  assert.doesNotMatch(report.safeMessage, /"error"|"metadata"|provider-body/);
});
