import type { RateLimitHeaders } from "./provider-limit-types.js";

export function parseGroqRateLimitHeaders(headers: Headers | Record<string, string>): RateLimitHeaders {
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
  };
  return {
    remainingRequests: parseInt(get("x-ratelimit-remaining-requests") ?? "0", 10),
    limitRequests: parseInt(get("x-ratelimit-limit-requests") ?? "0", 10),
    remainingTokens: parseInt(get("x-ratelimit-remaining-tokens") ?? "0", 10),
    limitTokens: parseInt(get("x-ratelimit-limit-tokens") ?? "0", 10),
    resetRequests: parseInt(get("x-ratelimit-reset-requests") ?? "0", 10),
    resetTokens: parseInt(get("x-ratelimit-reset-tokens") ?? "0", 10),
    retryAfterMs: get("retry-after") ? parseInt(get("retry-after")!, 10) * 1000 : undefined,
  };
}

export function parseAnthropicRateLimitHeaders(headers: Headers | Record<string, string>): RateLimitHeaders {
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
  };
  return {
    remainingRequests: parseInt(get("anthropic-ratelimit-requests-remaining") ?? "0", 10),
    limitRequests: parseInt(get("anthropic-ratelimit-requests-limit") ?? "0", 10),
    resetRequests: parseInt(get("anthropic-ratelimit-requests-reset") ?? "0", 10),
    remainingTokens: parseInt(get("anthropic-ratelimit-input-tokens-remaining") ?? "0", 10),
    limitTokens: parseInt(get("anthropic-ratelimit-input-tokens-limit") ?? "0", 10),
    resetTokens: parseInt(get("anthropic-ratelimit-input-tokens-reset") ?? "0", 10),
    retryAfterMs: get("retry-after") ? parseInt(get("retry-after")!, 10) * 1000 : undefined,
  };
}

export function parseOpenAIRateLimitHeaders(headers: Headers | Record<string, string>): RateLimitHeaders {
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
  };
  const retryAfter = get("retry-after");
  const retryAfterMs = get("retry-after-ms");
  return {
    remainingRequests: parseInt(get("x-ratelimit-remaining-requests") ?? "0", 10),
    limitRequests: parseInt(get("x-ratelimit-limit-requests") ?? "0", 10),
    resetRequests: parseInt(get("x-ratelimit-reset-requests") ?? "0", 10),
    remainingTokens: parseInt(get("x-ratelimit-remaining-tokens") ?? "0", 10),
    limitTokens: parseInt(get("x-ratelimit-limit-tokens") ?? "0", 10),
    resetTokens: parseInt(get("x-ratelimit-reset-tokens") ?? "0", 10),
    retryAfterMs: retryAfterMs ? parseInt(retryAfterMs, 10) : retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
  };
}

export function parseRetryAfter(headers: Headers | Record<string, string>): number | undefined {
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
  };
  const retryAfterMs = get("retry-after-ms");
  if (retryAfterMs) return parseInt(retryAfterMs, 10);
  const retryAfter = get("retry-after");
  if (retryAfter) {
    const val = parseInt(retryAfter, 10);
    if (!isNaN(val)) return val > 1000 ? val : val * 1000;
  }
  return undefined;
}
