import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  parseGroqRateLimitHeaders,
  parseAnthropicRateLimitHeaders,
  parseOpenAIRateLimitHeaders,
  parseRetryAfter,
} from "../../../src/core/providers/limits/rate-limit-parser.js";

describe("rate limit header parsing", () => {
  describe("Groq headers", () => {
    it("should parse Groq rate limit headers correctly", () => {
      const headers = new Headers({
        "x-ratelimit-remaining-requests": "25",
        "x-ratelimit-limit-requests": "30",
        "x-ratelimit-remaining-tokens": "5000",
        "x-ratelimit-limit-tokens": "6000",
        "x-ratelimit-reset-requests": "10",
        "retry-after": "5",
      });
      const result = parseGroqRateLimitHeaders(headers);
      assert.equal(result.remainingRequests, 25);
      assert.equal(result.limitRequests, 30);
      assert.equal(result.remainingTokens, 5000);
      assert.equal(result.retryAfterMs, 5000);
    });
  });

  describe("Anthropic headers", () => {
    it("should parse Anthropic rate limit headers correctly", () => {
      const headers = new Headers({
        "anthropic-ratelimit-requests-remaining": "48",
        "anthropic-ratelimit-requests-limit": "50",
        "anthropic-ratelimit-input-tokens-remaining": "95000",
        "anthropic-ratelimit-input-tokens-limit": "100000",
        "retry-after": "10",
      });
      const result = parseAnthropicRateLimitHeaders(headers);
      assert.equal(result.remainingRequests, 48);
      assert.equal(result.limitRequests, 50);
      assert.equal(result.remainingTokens, 95000);
      assert.equal(result.retryAfterMs, 10000);
    });
  });

  describe("OpenAI headers", () => {
    it("should parse OpenAI rate limit headers correctly", () => {
      const headers = new Headers({
        "x-ratelimit-remaining-requests": "400",
        "x-ratelimit-limit-requests": "500",
        "x-ratelimit-remaining-tokens": "80000",
        "x-ratelimit-limit-tokens": "100000",
        "x-ratelimit-reset-requests": "60",
        "retry-after-ms": "3000",
      });
      const result = parseOpenAIRateLimitHeaders(headers);
      assert.equal(result.remainingRequests, 400);
      assert.equal(result.limitRequests, 500);
      assert.equal(result.retryAfterMs, 3000);
    });
  });

  describe("retry-after parsing", () => {
    it("should parse retry-after-ms directly", () => {
      const headers = new Headers({ "retry-after-ms": "5000" });
      assert.equal(parseRetryAfter(headers), 5000);
    });

    it("should parse retry-after in seconds and convert to ms", () => {
      const headers = new Headers({ "retry-after": "10" });
      assert.equal(parseRetryAfter(headers), 10000);
    });

    it("should return undefined when no retry header exists", () => {
      const headers = new Headers({});
      assert.equal(parseRetryAfter(headers), undefined);
    });
  });
});
