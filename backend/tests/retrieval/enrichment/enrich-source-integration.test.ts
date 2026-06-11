import test from "node:test";
import assert from "node:assert/strict";
import { CacheManager } from "../../../src/services/cache-manager.js";
import { buildEnriched, enrichSource } from "../../../src/core/retrieval/enrichment/index.js";
import { enrichmentCacheKey } from "../../../src/core/retrieval/enrichment/enrichment-cache.js";
import { retrievalCacheManager } from "../../../src/core/retrieval-cache/index.js";

test("enrichSource runs extract clean chunk score card validate and cache policy", async () => {
  const rawRelevant = "The Supreme Court held that Article 21 protects privacy with proportionality safeguards. ".repeat(90);
  const rawBoilerplate = "cookie settings subscribe advertisement share this article login ".repeat(60);
  const cache = new CacheManager();

  const enriched = await enrichSource({
    title: "Privacy ruling",
    url: "https://main.sci.gov.in/privacy",
    domain: "main.sci.gov.in",
    snippet: "Article 21 privacy",
  }, {
    query: "Supreme Court Article 21 privacy proportionality",
    useCache: true,
    cache,
    fetchFn: (async () => new Response(`<html><article><p>${rawRelevant}</p><footer>${rawBoilerplate}</footer></article></html>`)) as typeof fetch,
  });

  assert.equal(enriched.extractionMethod, "readability_fetch");
  assert.equal(enriched.extractionStatus, "success");
  assert.ok(enriched.fullText);
  assert.ok(enriched.fullText.length <= 6_000);
  assert.doesNotMatch(enriched.fullText, /cookie settings|subscribe|advertisement/i);
  assert.ok(enriched.enrichmentCard);
  assert.ok(enriched.enrichmentCard.topChunks.length > 0);
  assert.equal(cache.get("enrichment", enrichmentCacheKey(enriched.url, "Supreme Court Article 21 privacy proportionality")), null);
  const cachedExtraction = retrievalCacheManager.getExtraction({ url: enriched.url, provider: "local" });
  assert.ok(cachedExtraction && !("negative" in cachedExtraction));
  assert.equal(cachedExtraction.url, enriched.url);
});

test("enrichSource does not cache failed extraction without snippet", async () => {
  const cache = new CacheManager();
  const enriched = await enrichSource({
    title: "Broken",
    url: "https://example.com/broken",
    domain: "example.com",
  }, {
    useCache: true,
    cache,
    fetchFn: (async () => new Response("error", { status: 500 })) as typeof fetch,
  });

  assert.equal(enriched.extractionStatus, "failed");
  assert.equal(cache.get("enrichment", enrichmentCacheKey(enriched.url, "Broken")), null);
});

test("enrichSources disables Firecrawl for a run after invalid_key", async () => {
  let firecrawlCalls = 0;
  const fetchFn = (async (url: string | URL | Request) => {
    if (String(url).includes("firecrawl")) {
      firecrawlCalls += 1;
      return new Response("invalid key", { status: 401 });
    }
    return new Response("not used", { status: 500 });
  }) as typeof fetch;

  const { enrichSources } = await import("../../../src/core/retrieval/enrichment/index.js");
  const enriched = await enrichSources([
    {
      title: "Privacy source one",
      url: "https://example.com/one",
      domain: "example.com",
      snippet: "DPDP privacy safeguards India proportionality source one. ".repeat(5),
    },
    {
      title: "Privacy source two",
      url: "https://example.com/two",
      domain: "example.com",
      snippet: "DPDP privacy safeguards India proportionality source two. ".repeat(5),
    },
  ], {
    firecrawlKey: "invalid",
    fetchFn,
    concurrency: 1,
  });

  assert.equal(firecrawlCalls, 1);
  assert.equal(enriched.length, 2);
  assert.equal(enriched[0]?.extractionMethod, "snippet_fallback");
  assert.equal(enriched[1]?.extractionMethod, "snippet_fallback");
});

test("snippet fallback remains limited and does not become strong citation evidence", async () => {
  const enriched = await buildEnriched({
    title: "Short privacy snippet",
    url: "https://example.com/privacy?utm_source=test",
    domain: "example.com",
    snippet: "DPDP privacy safeguards India.",
  }, {
    url: "https://example.com/privacy?utm_source=test",
    title: "Short privacy snippet",
    text: "",
    markdown: "DPDP privacy safeguards India.",
    extractionMethod: "snippet_fallback",
    extractionProvider: "snippet_fallback",
    extractionStatus: "partial",
    fallbackExtractionUsed: true,
  }, {
    query: "DPDP privacy safeguards India",
  });

  assert.equal(enriched.canonicalUrl, "https://example.com/privacy");
  assert.equal(enriched.limitedSource, true);
  assert.equal(enriched.citationEligible, false);
  assert.equal(enriched.citationStrength, "ineligible");
});
