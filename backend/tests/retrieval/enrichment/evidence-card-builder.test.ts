import test from "node:test";
import assert from "node:assert/strict";
import { buildEnrichmentCard } from "../../../src/core/retrieval/enrichment/evidence-card-builder.js";
import type { EnrichedSource, ScoredChunk } from "../../../src/core/retrieval/enrichment/types.js";

test("buildEnrichmentCard constructs a bounded card from top scored chunks", () => {
  const source: EnrichedSource = {
    sourceId: 7,
    title: "Supreme Court privacy ruling",
    url: "https://main.sci.gov.in/privacy",
    domain: "main.sci.gov.in",
    fullText: "trimmed text",
    snippet: "privacy snippet",
    textLength: 12,
    extractionMethod: "readability_fetch",
    extractionStatus: "success",
    extractionQuality: "high",
    citationEligible: true,
  };
  const chunks: ScoredChunk[] = Array.from({ length: 7 }, (_, index) => ({
    index,
    text: `Chunk ${index} says Supreme Court Article 21 privacy proportionality ${index}.`,
    charLength: 70,
    relevanceScore: 10 - index,
  }));

  const card = buildEnrichmentCard(source, chunks, "Supreme Court Article 21 privacy");

  assert.equal(card.sourceId, 7);
  assert.equal(card.url, source.url);
  assert.equal(card.topChunks.length, 5);
  assert.equal(card.limitedSource, false);
  assert.equal(card.citationEligible, true);
  assert.equal(card.citationStrength, "strong");
  assert.ok(card.keyTermsMatched.includes("privacy"));
});

test("buildEnrichmentCard marks snippet fallback as limited and weak at best", () => {
  const source: EnrichedSource = {
    title: "Snippet source",
    url: "https://news.example.com/item",
    domain: "news.example.com",
    fullText: "short snippet",
    snippet: "short snippet",
    textLength: 13,
    extractionMethod: "snippet_fallback",
    extractionStatus: "partial",
    fallbackExtractionUsed: true,
    extractionQuality: "medium",
    citationEligible: true,
  };

  const card = buildEnrichmentCard(source, [{
    index: 0,
    text: "short snippet about Parliament",
    charLength: 30,
    relevanceScore: 2,
  }], "Parliament");

  assert.equal(card.limitedSource, true);
  assert.equal(card.citationEligible, false);
  assert.equal(card.citationStrength, "ineligible");
});
