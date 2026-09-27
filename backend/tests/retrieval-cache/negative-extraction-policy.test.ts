import assert from "node:assert/strict";
import test from "node:test";
import { shouldWriteNegativeExtraction } from "../../src/core/retrieval-cache/retrieval-cache-policy.js";

test("shouldWriteNegativeExtraction: 404 and 403 remain URL negatives", () => {
  assert.deepEqual(shouldWriteNegativeExtraction({ error: "HTTP 404 not found" }), {
    write: true,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    reason: "not_found",
  });
  assert.deepEqual(shouldWriteNegativeExtraction({ error: "403 forbidden paywall" }), {
    write: true,
    ttlMs: 24 * 60 * 60 * 1000,
    reason: "forbidden",
  });
});

test("shouldWriteNegativeExtraction: 429 and temporary failures route to provider_health", () => {
  assert.deepEqual(shouldWriteNegativeExtraction({ error: "429 rate limit" }), {
    write: false,
    ttlMs: 0,
    reason: "rate_limited",
    routeToProviderHealth: true,
  });
  assert.deepEqual(shouldWriteNegativeExtraction({ provider: "firecrawl", error: "timeout 504" }), {
    write: false,
    ttlMs: 0,
    reason: "firecrawl_timeout",
    routeToProviderHealth: true,
  });
  assert.deepEqual(shouldWriteNegativeExtraction({ status: "failed", error: "network timeout 408" }), {
    write: false,
    ttlMs: 0,
    reason: "temporary_extraction_failure",
    routeToProviderHealth: true,
  });
});

test("shouldWriteNegativeExtraction: jina 422 only after full chain failure", () => {
  assert.deepEqual(shouldWriteNegativeExtraction({ provider: "jina", error: "Jina failed 422", fullChainFailed: false }), {
    write: false,
    ttlMs: 0,
    reason: "jina_422",
    routeToProviderHealth: true,
  });
  assert.deepEqual(shouldWriteNegativeExtraction({ provider: "jina", error: "Jina failed 422", fullChainFailed: true }), {
    write: true,
    ttlMs: 60 * 60 * 1000,
    reason: "jina_422",
  });
  assert.equal(shouldWriteNegativeExtraction({ provider: "jina", error: "Jina failed 422" }).write, true);
});
