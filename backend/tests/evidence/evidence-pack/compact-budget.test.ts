import test from "node:test";
import assert from "node:assert/strict";
import { buildBudgetedEvidencePack } from "../../../src/core/evidence/evidence-compressor.js";
import { evidenceSource } from "./helpers.js";

test("B14-18 compact prompt budgeting never creates zero-evidence cards", () => {
  const limitationOnly = evidenceSource({
    id: 2,
    title: "Limitation-only source",
    url: "https://weak.example/source-2",
    canonicalUrl: "https://weak.example/source-2",
    domain: "weak.example",
    fullText: null,
    snippet: null,
    keyFacts: [],
    keyNumbers: [],
    legalHoldings: [],
    topChunks: [],
    limitations: ["Only limitation text exists."],
    citationEligible: true,
    limitedSource: true,
    extractionQuality: "snippet",
    citationStrength: "weak",
  });
  const useful = evidenceSource({
    id: 1,
    keyFacts: ["Useful source-backed claim for the final prompt."],
    topChunks: [{ text: "Useful source-backed claim for the final prompt.", score: 10, chunkIndex: 0, sourceId: 1 }],
  });

  const pack = buildBudgetedEvidencePack([limitationOnly, useful], "useful claim", {
    mode: "fast_research",
    maxCards: 2,
    maxPackChars: 620,
    maxCardChars: 320,
    maxClaims: 1,
    maxSnippets: 0,
  });

  assert.ok(pack.cards.every((card) => card.atomicClaims.length > 0 || card.snippets.length > 0 || card.keyNumbers.length > 0 || card.legalHoldings.length > 0));
  assert.equal(pack.cards.some((card) => card.sourceId === 2), false);
});
