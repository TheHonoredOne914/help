import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeUrl, normalizeQuery, searchResultCacheKey, urlExtractionCacheKey } from "../../src/core/retrieval-cache/retrieval-cache-key.js";
import { retrievalCacheStore } from "../../src/core/retrieval-cache/retrieval-cache-store.js";
import { createExtractionCooldown, recordExtractionFailure } from "../../src/core/providers/limits/extraction-cooldown.js";
import type { EnrichedSource } from "../../src/core/retrieval/enrichment/types.js";

process.env.RETRIEVAL_CACHE_ENABLED = "true";

test("retrieval cache canonicalizes URL and query inputs", () => {
  assert.equal(
    canonicalizeUrl("HTTPS://www.Example.com/a/path/?utm_source=x&b=2&gclid=abc#frag"),
    "https://example.com/a/path?b=2",
  );
  assert.equal(normalizeQuery(" Please   Kindly  Supreme Court doctrine??? "), "supreme court doctrine");

  const keyA = searchResultCacheKey({ schemaVersion: 1, provider: "tavily", query: "Please  Data Protection Bill?", bucket: "court_legal", maxResults: 5 });
  const keyB = searchResultCacheKey({ schemaVersion: 1, provider: "tavily", query: "data protection bill", bucket: "court_legal", maxResults: 5 });
  assert.equal(keyA, keyB);
});

test("retrieval cache skips unserializable entries without throwing", () => {
  const cyclic: Record<string, unknown> = { ok: true };
  cyclic.self = cyclic;

  assert.doesNotThrow(() => retrievalCacheStore.set("search", "cyclic-entry", cyclic));
  assert.equal(retrievalCacheStore.get("search", "cyclic-entry"), null);
});

test("URL extraction negative cache is distinct from positive cache", async () => {
  const { retrievalCacheManager } = await import("../../src/core/retrieval-cache/index.js");
  const url = "https://example.com/judgment?utm_campaign=x";
  const wrote = retrievalCacheManager.writeNegativeExtraction({ provider: "jina", url }, { status: "failed", error: "Jina failed 422" });
  assert.equal(wrote, true);

  const keyA = urlExtractionCacheKey({ schemaVersion: 1, provider: "jina", url, freshness: "semi_static" });
  const keyB = urlExtractionCacheKey({ schemaVersion: 1, provider: "firecrawl", url, freshness: "semi_static" });
  assert.equal(keyA, keyB);

  const hit = retrievalCacheManager.getExtraction({ provider: "jina", url, allowNegativeHit: true });
  assert.equal(Boolean(hit && "negative" in hit && hit.negative), true);
});

test("snippet fallback cache hit stays weak and limited", async () => {
  const { retrievalCacheManager } = await import("../../src/core/retrieval-cache/index.js");
  const source: EnrichedSource = {
    title: "Snippet source",
    url: "https://example.com/report",
    canonicalUrl: "https://example.com/report",
    domain: "example.com",
    fullText: "short snippet only",
    snippet: "short snippet only",
    textLength: 18,
    extractionMethod: "snippet_fallback",
    extractionStatus: "partial",
    fallbackExtractionUsed: true,
    extractionQuality: "low",
    citationEligible: true,
  };

  retrievalCacheManager.writeExtraction({ provider: "local", url: source.url }, source);
  const hit = retrievalCacheManager.getExtraction({ provider: "local", url: source.url });
  assert.ok(hit && !("negative" in hit));
  assert.equal(hit.extractionMethod, "snippet_fallback");
  assert.equal(hit.limitedSource, true);
  assert.equal(hit.citationEligible, false);
});

test("provider health cache hydrates Jina 422 and Firecrawl cooldown", async () => {
  const { retrievalCacheManager } = await import("../../src/core/retrieval-cache/index.js");
  const state = createExtractionCooldown();
  recordExtractionFailure(state, "jina", 422, canonicalizeUrl("https://example.com/bad?utm_medium=x"));
  recordExtractionFailure(state, "firecrawl", 504);
  recordExtractionFailure(state, "firecrawl", 504);
  recordExtractionFailure(state, "firecrawl", 504);
  retrievalCacheManager.persistExtractionCooldown(state);

  const hydrated = retrievalCacheManager.hydrateExtractionCooldown(createExtractionCooldown());
  assert.equal(hydrated.jina422Urls.has("https://example.com/bad"), true);
  assert.equal(hydrated.firecrawlCooledDown, true);
  assert.equal(hydrated.firecrawlTimeoutCount, 3);
});

test("provider health cache is scoped by extraction key fingerprint", async () => {
  const { retrievalCacheManager } = await import("../../src/core/retrieval-cache/index.js");
  retrievalCacheStore.clearNamespace("provider_health");
  const state = createExtractionCooldown();
  recordExtractionFailure(state, "firecrawl", 504);
  recordExtractionFailure(state, "firecrawl", 504);
  recordExtractionFailure(state, "firecrawl", 504);

  retrievalCacheManager.persistExtractionCooldown(state, { scope: "key-a" });

  const otherScope = retrievalCacheManager.hydrateExtractionCooldown(createExtractionCooldown(), { scope: "key-b" });
  const sameScope = retrievalCacheManager.hydrateExtractionCooldown(createExtractionCooldown(), { scope: "key-a" });

  assert.equal(otherScope.firecrawlCooledDown, false);
  assert.equal(sameScope.firecrawlCooledDown, true);
});

test("evidence-ready cache does not reuse cards across agenda fingerprints", async () => {
  const { retrievalCacheManager } = await import("../../src/core/retrieval-cache/index.js");
  retrievalCacheStore.clearNamespace("evidence_card");
  const source = {
    id: 7,
    title: "Agenda specific source",
    url: "https://example.com/source",
    canonicalUrl: "https://example.com/source",
    domain: "example.com",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 90,
    date: null,
    fullText: "The same source text can score differently for different agendas.",
    snippet: null,
    extractionQuality: "full",
    keyFacts: [],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: [],
    limitations: [],
    confidence: "high",
    citationEligible: true,
    topChunks: [],
    citationStrength: "strong",
    limitedSource: false,
  };
  const card = {
    sourceId: 7,
    title: source.title,
    url: source.url,
    sourceClass: source.sourceClass,
    bucketIds: source.bucketIds,
    relevanceScore: 90,
    keyFacts: [],
    keyNumbers: [],
    legalHoldings: [],
    limitations: [],
    contentPreview: source.fullText,
    extractionQuality: "full",
    citationStrength: "strong",
    limitedSource: false,
  };

  retrievalCacheManager.writeEvidenceCard(source as any, card as any, "agenda-a");

  assert.equal(retrievalCacheManager.getEvidenceCard(source as any, "agenda-b"), null);
  assert.deepEqual(retrievalCacheManager.getEvidenceCard(source as any, "agenda-a"), card);
});
