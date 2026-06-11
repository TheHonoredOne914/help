// Set env vars before any import so the provider self-configures.
// Intentionally DO NOT set GEEKFLARE_ENDPOINT_VERIFIED — the default behavior is
// the provider refuses to self-declare ready until an operator explicitly verifies the endpoint.
process.env.GEEKFLARE_API_KEY = "geekflare-test-key";
process.env.GEEKFLARE_ENABLED = "true";
process.env.GEEKFLARE_ENDPOINT_VERIFIED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { geekflareExtractorProvider } from "../../src/core/search/providers/geekflare-extractor-provider.js";

const KEYS = { geekflare: "geekflare-test-key" } as Record<string, unknown>;

test("geekflare provider refuses to self-declare ready when endpoint is unverified", () => {
  // configured() must return false until GEEKFLARE_ENDPOINT_VERIFIED=true
  assert.equal(geekflareExtractorProvider.configured(KEYS as never), false);
});

test("geekflare extraction refuses when endpoint is unverified", async () => {
  await assert.rejects(
    geekflareExtractorProvider.extract("https://example.com/page", KEYS as never, {
      fetchFn: async () => new Response("<html></html>", { status: 200 }),
    }),
    (error: unknown) => {
      const e = error as { name?: string; status?: string; message?: string };
      return (
        e?.name === "SearchProviderError" &&
        e.status === "unavailable" &&
        /endpoint is not verified/i.test(e.message ?? "")
      );
    },
  );
});

test("geekflare extraction refuses when key is missing", async () => {
  // Endpoint must be verified first to bypass the unverified-endpoint guard,
  // so the missing_key path is actually exercised.
  const previousApiKey = process.env.GEEKFLARE_API_KEY;
  const previousVerified = process.env.GEEKFLARE_ENDPOINT_VERIFIED;
  delete process.env.GEEKFLARE_API_KEY;
  process.env.GEEKFLARE_ENDPOINT_VERIFIED = "true";
  try {
    await assert.rejects(
      geekflareExtractorProvider.extract("https://example.com/x", {} as never, {
        fetchFn: async () => new Response("ok", { status: 200 }),
      }),
      (error: unknown) => {
        const e = error as { name?: string; status?: string };
        return e?.name === "SearchProviderError" && e.status === "missing_key";
      },
    );
  } finally {
    if (previousApiKey !== undefined) process.env.GEEKFLARE_API_KEY = previousApiKey;
    if (previousVerified !== undefined) process.env.GEEKFLARE_ENDPOINT_VERIFIED = previousVerified;
    else process.env.GEEKFLARE_ENDPOINT_VERIFIED = "false";
  }
});

test("geekflare healthCheck returns configured=true but canExtract=false when unverified", async () => {
  // Reload module isn't needed: with GEEKFLARE_ENDPOINT_VERIFIED=false the provider
  // still self-declares the key is set, but reports canExtract=false until the endpoint is verified.
  const health = await geekflareExtractorProvider.healthCheck(KEYS as never, {
    fetchFn: async () => new Response("<html></html>", { status: 200 }),
    timeoutMs: 8000,
  });
  assert.equal(health.canExtract, false);
  // With endpoint unverified, configured() is false, so health.configured is also false.
  assert.equal(health.configured, false);
});

test("geekflare provider accepts configured() and throws on 502 once endpoint is verified", async () => {
  const previous = process.env.GEEKFLARE_ENDPOINT_VERIFIED;
  process.env.GEEKFLARE_ENDPOINT_VERIFIED = "true";
  try {
    assert.equal(geekflareExtractorProvider.configured(KEYS as never), true);
    await assert.rejects(
      geekflareExtractorProvider.extract("https://example.com/502", KEYS as never, {
        fetchFn: async () => new Response("Bad Gateway", { status: 502 }),
      }),
      (error: unknown) => {
        const e = error as { name?: string; statusCode?: number; status?: string };
        return e?.name === "SearchProviderError" && e.statusCode === 502;
      },
    );
  } finally {
    if (previous !== undefined) process.env.GEEKFLARE_ENDPOINT_VERIFIED = previous;
    else delete process.env.GEEKFLARE_ENDPOINT_VERIFIED;
  }
});
