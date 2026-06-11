// Set env vars before any import so the provider self-configures.
process.env.SCRAPINGBEE_API_KEY = "scrapingbee-test-key";
process.env.SCRAPINGBEE_ENABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { scrapingbeeExtractorProvider } from "../../src/core/search/providers/scrapingbee-extractor-provider.js";

const KEYS = { scrapingbee: "scrapingbee-test-key" } as Record<string, unknown>;

test("scrapingbee extraction sends api_key+url and returns success on HTML", async () => {
  let captured = "";
  const result = await scrapingbeeExtractorProvider.extract("https://example.com/page", KEYS as never, {
    fetchFn: async (url) => {
      captured = String(url);
      return new Response("<html><body>ScrapingBee content</body></html>", { status: 200 });
    },
  });

  const params = new URL(captured).searchParams;
  assert.equal(params.get("api_key"), "scrapingbee-test-key");
  assert.equal(params.get("url"), "https://example.com/page");
  assert.equal(result.provider, "scrapingbee");
  assert.equal(result.status, "success");
  assert.ok(result.text?.includes("ScrapingBee content"));
});

test("scrapingbee extraction does NOT send render_js by default", async () => {
  let captured = "";
  await scrapingbeeExtractorProvider.extract("https://example.com/x", KEYS as never, {
    fetchFn: async (url) => {
      captured = String(url);
      return new Response("<html></html>", { status: 200 });
    },
  });
  const params = new URL(captured).searchParams;
  assert.equal(params.get("render_js"), null);
});

test("scrapingbee extraction on 401/403 throws SearchProviderError with invalid_key status", async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      scrapingbeeExtractorProvider.extract("https://example.com/auth", KEYS as never, {
        fetchFn: async () => new Response("unauthorized", { status }),
      }),
      (error: unknown) => {
        const e = error as { name?: string; status?: string; statusCode?: number };
        return e?.name === "SearchProviderError" && e.status === "invalid_key" && e.statusCode === status;
      },
    );
  }
});

test("scrapingbee extraction on 429 surfaces retry-after via SearchProviderError", async () => {
  let caught: unknown = null;
  try {
    await scrapingbeeExtractorProvider.extract("https://example.com/rate", KEYS as never, {
      fetchFn: async () =>
        new Response("Too Many Requests", { status: 429, headers: { "retry-after": "3" } }),
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected scrapingbee 429 to throw");
  const e = caught as { name?: string; status?: string; statusCode?: number; retryAfterMs?: number };
  assert.equal(e.name, "SearchProviderError");
  assert.equal(e.status, "rate_limited");
  assert.equal(e.statusCode, 429);
  assert.equal(e.retryAfterMs, 3000);
});

test("scrapingbee extraction refuses when key is missing", async () => {
  const previous = process.env.SCRAPINGBEE_API_KEY;
  delete process.env.SCRAPINGBEE_API_KEY;
  try {
    await assert.rejects(
      scrapingbeeExtractorProvider.extract("https://example.com/x", {} as never, {
        fetchFn: async () => new Response("ok", { status: 200 }),
      }),
      (error: unknown) => {
        const e = error as { name?: string; status?: string };
        return e?.name === "SearchProviderError" && e.status === "missing_key";
      },
    );
  } finally {
    if (previous !== undefined) process.env.SCRAPINGBEE_API_KEY = previous;
  }
});

test("scrapingbee extraction with empty content returns partial status", async () => {
  const result = await scrapingbeeExtractorProvider.extract("https://example.com/empty", KEYS as never, {
    fetchFn: async () => new Response("", { status: 200 }),
  });
  assert.equal(result.provider, "scrapingbee");
  assert.equal(result.status, "partial");
  assert.equal(result.metadata?.emptyContent, true);
});
