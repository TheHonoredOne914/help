import test from "node:test";
import assert from "node:assert/strict";
import { CacheManager } from "../../../src/services/cache-manager.js";
import { cacheEnrichedSource, enrichmentCachePolicy } from "../../../src/core/retrieval/enrichment/enrichment-cache.js";
import type { EnrichedSource } from "../../../src/core/retrieval/enrichment/types.js";

function source(status: EnrichedSource["extractionStatus"], method: EnrichedSource["extractionMethod"] = "readability_fetch"): EnrichedSource {
  return {
    title: "Source",
    url: "https://example.com/source",
    domain: "example.com",
    fullText: status === "failed" ? null : "source text",
    snippet: "snippet",
    textLength: status === "failed" ? 0 : 11,
    extractionMethod: method,
    extractionStatus: status,
    extractionQuality: status === "success" ? "high" : "low",
    citationEligible: status === "success",
  };
}

test("enrichmentCachePolicy skips failed extraction writes", () => {
  assert.deepEqual(enrichmentCachePolicy("failed"), { status: "failed", write: false });
});

test("cacheEnrichedSource uses shared TTL policy for partial and snippet fallback results", () => {
  let now = 1_000;
  const cache = new CacheManager({ now: () => now });
  const partial = source("partial");
  cacheEnrichedSource(cache, partial);
  assert.ok(cache.get("enrichment", partial.url));
  now += 15 * 60 * 1000 + 1;
  assert.ok(cache.get("enrichment", partial.url));

  now = 10_000;
  const snippet = source("partial", "snippet_fallback");
  snippet.citationEligible = true;
  cacheEnrichedSource(cache, snippet);
  const cachedSnippet = cache.get<EnrichedSource>("enrichment", snippet.url);
  assert.equal(cachedSnippet?.citationEligible, false);
  assert.equal(cachedSnippet?.limitedSource, true);
  assert.equal(cachedSnippet?.citationStrength, "ineligible");
  now += 15 * 60 * 1000 + 1;
  assert.equal(cache.get("enrichment", snippet.url), null);
});

test("cacheEnrichedSource stores success with standard freshness", () => {
  const cache = new CacheManager({ now: () => 1_000 });
  const ok = source("success");

  cacheEnrichedSource(cache, ok);

  assert.equal(cache.get<EnrichedSource>("enrichment", ok.url)?.title, "Source");
});
