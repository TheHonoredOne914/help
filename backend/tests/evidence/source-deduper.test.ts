import test from "node:test";
import assert from "node:assert/strict";
import { mergeDuplicateSource } from "../../src/core/evidence/source-deduper.js";
import type { EvidenceSource, EvidenceSourceInput } from "../../src/core/evidence/evidence-registry.js";

function existing(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    id: 1,
    title: "Existing source",
    url: "https://example.org/source",
    canonicalUrl: "https://example.org/source",
    domain: "example.org",
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    authorityScore: 70,
    date: null,
    fullText: null,
    snippet: "Existing snippet",
    extractionQuality: "snippet",
    keyFacts: ["Existing fact"],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: [],
    limitations: ["Existing limitation"],
    confidence: "medium",
    citationEligible: true,
    topChunks: [{ text: "Existing chunk", score: 1, chunkIndex: 0 }],
    limitedSource: true,
    citationStrength: "weak",
    ...overrides,
  };
}

function incoming(overrides: Partial<EvidenceSourceInput> = {}): EvidenceSourceInput {
  return {
    title: "Incoming source",
    url: "https://example.org/source",
    canonicalUrl: "https://example.org/source",
    domain: "example.org",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 98,
    date: null,
    fullText: "Incoming full text with Supreme Court Article 19 evidence.",
    snippet: "Incoming snippet",
    extractionQuality: "full",
    keyFacts: ["Incoming fact"],
    keyNumbers: ["2024"],
    legalHoldings: ["Court held Article 19 applies."],
    namedEntities: ["Supreme Court"],
    limitations: [],
    confidence: "high",
    citationEligible: true,
    enrichmentCard: { reducerName: "local" },
    topChunks: [{ text: "Incoming full text chunk", score: 9, chunkIndex: 1 }],
    limitedSource: false,
    citationStrength: "strong",
    ...overrides,
  };
}

test("mergeDuplicateSource keeps stable id and best scalar fields", () => {
  const merged = mergeDuplicateSource(existing(), incoming());

  assert.equal(merged.id, 1);
  assert.equal(merged.fullText, "Incoming full text with Supreme Court Article 19 evidence.");
  assert.equal(merged.extractionQuality, "full");
  assert.equal(merged.authorityScore, 98);
  assert.equal(merged.limitedSource, false);
  assert.deepEqual(merged.enrichmentCard, { reducerName: "local" });
});

test("mergeDuplicateSource dedupes arrays and top chunks", () => {
  const merged = mergeDuplicateSource(existing({
    keyFacts: ["Duplicate fact"],
    topChunks: [{ text: "Same chunk text", score: 2, chunkIndex: 5 }],
  }), incoming({
    keyFacts: ["Duplicate fact", "New fact"],
    topChunks: [
      { text: "Same chunk text", score: 4, chunkIndex: 5 },
      { text: "Different chunk text", score: 6, chunkIndex: 6 },
    ],
  }));

  assert.deepEqual(merged.keyFacts, ["Duplicate fact", "New fact"]);
  assert.deepEqual(merged.topChunks.map((chunk) => chunk.chunkIndex), [6, 5]);
});
