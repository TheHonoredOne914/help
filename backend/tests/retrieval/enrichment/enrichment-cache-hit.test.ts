import test from "node:test";
import assert from "node:assert/strict";
import { CacheManager } from "../../../src/services/cache-manager.js";
import { enrichSource } from "../../../src/core/retrieval/enrichment/enrich-source.js";
import { enrichmentCacheKey } from "../../../src/core/retrieval/enrichment/enrichment-cache.js";
import { retrievalCacheManager } from "../../../src/core/retrieval-cache/index.js";

test("enrichSource cache hit skips re-extract via CacheManager and retrieval cache", async () => {
  const rawRelevant = "The Supreme Court held that Article 21 protects privacy with proportionality safeguards. ".repeat(90);
  const cache = new CacheManager();
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    return new Response(`<html><article><p>${rawRelevant}</p></article></html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  const source = {
    title: "Privacy ruling",
    url: "https://main.sci.gov.in/cache-hit-privacy",
    domain: "main.sci.gov.in",
    snippet: "Article 21 privacy",
  };
  const query = "Supreme Court Article 21 privacy proportionality";

  const first = await enrichSource(source, {
    query,
    useCache: true,
    cache,
    fetchFn,
  });

  assert.equal(first.extractionMethod, "readability_fetch");
  assert.ok(first.fullText);
  assert.equal(fetchCalls, 1);
  assert.ok(cache.get("enrichment", enrichmentCacheKey(source.url, query)));
  const retrievalHit = retrievalCacheManager.getExtraction({ url: source.url, provider: "local" });
  assert.ok(retrievalHit && !("negative" in retrievalHit));

  const second = await enrichSource(source, {
    query,
    useCache: true,
    cache,
    fetchFn,
  });

  assert.equal(fetchCalls, 1, "second enrichSource must not re-fetch when cache hits");
  assert.equal(second.url, first.url);
  assert.ok(second.fullText);
});

test("enrichSource does not write empty failed enrichments to CacheManager", async () => {
  const cache = new CacheManager();
  const enriched = await enrichSource({
    title: "Broken",
    url: "https://example.com/cache-fail-empty",
    domain: "example.com",
  }, {
    useCache: true,
    cache,
    fetchFn: (async () => new Response("error", { status: 500 })) as typeof fetch,
  });

  assert.equal(enriched.extractionStatus, "failed");
  assert.equal(cache.get("enrichment", enrichmentCacheKey(enriched.url, "Broken")), null);
});
