import test from "node:test";
import assert from "node:assert/strict";
import { pruneInvalidEvidenceCardChunks, validateEvidenceCard } from "../../../src/core/retrieval/enrichment/evidence-card-validator.js";
import type { EnrichmentEvidenceCard, SourceChunk } from "../../../src/core/retrieval/enrichment/types.js";

test("validateEvidenceCard identifies exact and unverified chunks", () => {
  const originalChunks: SourceChunk[] = [
    { index: 0, text: "The Supreme Court held that Article 21 protects privacy.", charLength: 58 },
    { index: 1, text: "Parliamentary records show ministry accountability.", charLength: 50 },
  ];
  const card: EnrichmentEvidenceCard = {
    sourceId: 1,
    url: "https://example.com",
    title: "Example",
    topChunks: [originalChunks[0].text, "A model invented this sentence."],
    citationEligible: true,
    limitedSource: false,
    relevanceScore: 5,
    extractionQuality: "high",
    keyTermsMatched: ["privacy"],
    citationStrength: "medium",
  };

  const result = validateEvidenceCard(card, originalChunks);

  assert.equal(result.valid, false);
  assert.deepEqual(result.verifiedChunks, [0]);
  assert.deepEqual(result.invalidChunks, [1]);
});

test("pruneInvalidEvidenceCardChunks drops unverified top chunks and evidence items", () => {
  const originalChunks: SourceChunk[] = [
    { index: 0, text: "Supreme Court Article 21 privacy holding.", charLength: 41 },
  ];
  const card: EnrichmentEvidenceCard = {
    sourceId: 1,
    url: "https://example.com",
    title: "Example",
    topChunks: [originalChunks[0].text, "invented"],
    evidenceItems: [
      { claim: "privacy", snippet: "Article 21 privacy holding", relevance: "high" },
      { claim: "invented", snippet: "not in source", relevance: "low" },
    ],
    citationEligible: true,
    limitedSource: false,
    relevanceScore: 5,
    extractionQuality: "high",
    keyTermsMatched: ["privacy"],
    citationStrength: "medium",
  };

  const pruned = pruneInvalidEvidenceCardChunks(card, originalChunks);

  assert.deepEqual(pruned.topChunks, [originalChunks[0].text]);
  assert.equal(pruned.evidenceItems?.length, 1);
});
