// Set env vars before any import so the provider self-configures.
process.env.ZENROWS_API_KEY = "zenrows-test-key";
process.env.ZENROWS_ENABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { zenrowsExtractorProvider } from "../../src/core/search/providers/zenrows-extractor-provider.js";

const KEYS = { zenrows: "zenrows-test-key" } as Record<string, unknown>;

test("zenrows extraction sends apikey+url and returns success on HTML", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const result = await zenrowsExtractorProvider.extract("https://example.com/page", KEYS as never, {
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("<html><body>Hello from ZenRows</body></html>", { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.zenrows\.com\/v1\/\?/);
  const params = new URL(calls[0].url).searchParams;
  assert.equal(params.get("apikey"), "zenrows-test-key");
  assert.equal(params.get("url"), "https://example.com/page");
  assert.equal(result.provider, "zenrows");
  assert.equal(result.status, "success");
  assert.ok(result.text?.includes("Hello from ZenRows"));
});

test("zenrows extraction does NOT send js_render by default", async () => {
  let captured = "";
  await zenrowsExtractorProvider.extract("https://example.com/x", KEYS as never, {
    fetchFn: async (url) => {
      captured = String(url);
      return new Response("<html></html>", { status: 200 });
    },
  });
  const params = new URL(captured).searchParams;
  assert.equal(params.get("js_render"), null);
});

test("zenrows extraction does NOT send premium_proxy by default", async () => {
  let captured = "";
  await zenrowsExtractorProvider.extract("https://example.com/y", KEYS as never, {
    fetchFn: async (url) => {
      captured = String(url);
      return new Response("<html></html>", { status: 200 });
    },
  });
  const params = new URL(captured).searchParams;
  assert.equal(params.get("premium_proxy"), null);
});

test("zenrows extraction with empty content returns partial status", async () => {
  const result = await zenrowsExtractorProvider.extract("https://example.com/empty", KEYS as never, {
    fetchFn: async () => new Response("", { status: 200 }),
  });
  assert.equal(result.provider, "zenrows");
  assert.equal(result.status, "partial");
  assert.equal(result.metadata?.emptyContent, true);
});

test("zenrows extraction on 429 throws SearchProviderError with rate_limited status", async () => {
  await assert.rejects(
    zenrowsExtractorProvider.extract("https://example.com/rate", KEYS as never, {
      fetchFn: async () => new Response("rate limited", { status: 429 }),
    }),
    (error: unknown) => {
      const e = error as { name?: string; status?: string; statusCode?: number };
      return e?.name === "SearchProviderError" && e.status === "rate_limited" && e.statusCode === 429;
    },
  );
});

test("zenrows extraction on 401 throws SearchProviderError with invalid_key status", async () => {
  await assert.rejects(
    zenrowsExtractorProvider.extract("https://example.com/unauth", KEYS as never, {
      fetchFn: async () => new Response("unauthorized", { status: 401 }),
    }),
    (error: unknown) => {
      const e = error as { name?: string; status?: string; statusCode?: number };
      return e?.name === "SearchProviderError" && e.status === "invalid_key" && e.statusCode === 401;
    },
  );
});

test("zenrows extraction refuses when key is missing", async () => {
  const previous = process.env.ZENROWS_API_KEY;
  delete process.env.ZENROWS_API_KEY;
  try {
    await assert.rejects(
      zenrowsExtractorProvider.extract("https://example.com/x", {} as never, {
        fetchFn: async () => new Response("ok", { status: 200 }),
      }),
      (error: unknown) => {
        const e = error as { name?: string; status?: string };
        return e?.name === "SearchProviderError" && e.status === "missing_key";
      },
    );
  } finally {
    if (previous !== undefined) process.env.ZENROWS_API_KEY = previous;
  }
});

test("zenrows healthCheck reports configured=true on success", async () => {
  const health = await zenrowsExtractorProvider.healthCheck(KEYS as never, {
    fetchFn: async () => new Response("<html><body>ok</body></html>", { status: 200 }),
    timeoutMs: 8000,
  });
  assert.equal(health.configured, true);
  assert.equal(health.healthy, true);
  assert.equal(health.canExtract, true);
});
