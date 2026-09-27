import assert from "node:assert/strict";
import test from "node:test";
import { namedPackLimit, packCardLimit, packTokenBudget, trimCardsToTokenBudget } from "../../src/core/evidence/evidence-pack/pack-budget.js";
import { rankEvidenceCards } from "../../src/core/evidence/evidence-pack/pack-ranking.js";
import type { EvidenceCard } from "../../src/core/evidence/evidence-pack/types.js";
import type { AgendaContract } from "../../src/core/agenda/agenda-contract.js";

test("deep pack limits align with floor 45 not 80", () => {
  assert.equal(namedPackLimit("deep_research"), 45);
  assert.ok(namedPackLimit("deep_research") <= 60);
  const contract = { minimumEvidenceCardsPerModel: 45 } as AgendaContract;
  assert.ok(packCardLimit(contract, "deep_research") >= 45);
  assert.ok(packCardLimit(contract, "deep_research") < 80);
  assert.ok(packTokenBudget("deep_research") >= 10_000);
});

test("fast pack limits support 40-source briefs", () => {
  assert.equal(namedPackLimit("fast_research"), 40);
  const contract = { minimumEvidenceCardsPerModel: 40 } as AgendaContract;
  assert.ok(packCardLimit(contract, "fast_research") >= 40);
});

test("council pack limits support the 110-source floor", () => {
  const contract = { minimumEvidenceCardsPerModel: 30, minimumUniqueCitedSources: 110 } as AgendaContract;
  assert.equal(namedPackLimit("council"), 110);
  assert.ok(packCardLimit(contract, "council") >= 110);
  assert.ok(packTokenBudget("council") >= 40_000);
});

test("trimCardsToTokenBudget stops before overflowing", () => {
  const cards = Array.from({ length: 20 }, (_, index) => ({
    contentPreview: "x".repeat(800),
    topChunks: [{ text: "y".repeat(400) }],
    keyFacts: ["fact"],
    id: index,
  }));
  const trimmed = trimCardsToTokenBudget(cards as any, "fast_research");
  assert.ok(trimmed.length < cards.length);
  assert.ok(trimmed.length >= 1);
});

test("rankEvidenceCards folds BM25 and floors weak chunks", () => {
  const weak: EvidenceCard = {
    sourceId: 1,
    citation: "[1]",
    title: "Weak",
    url: "https://example.com/w",
    sourceClass: "general_media",
    bucketIds: ["indian_major_media"],
    date: null,
    relevanceScore: 50,
    keyFacts: ["a"],
    keyNumbers: [],
    legalHoldings: [],
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: "x",
    limitations: [],
    usableSections: [],
    citationStrength: "weak",
    topChunks: [{ text: "weak match", score: 0.1, chunkIndex: 0 }],
    limitedSource: false,
    extractionQuality: "partial",
    namedEntities: [],
  };
  const strong: EvidenceCard = {
    ...weak,
    sourceId: 2,
    title: "Strong",
    url: "https://example.com/s",
    topChunks: [{ text: "strong match privacy judgment", score: 2.5, chunkIndex: 0 }],
    citationStrength: "strong",
  };
  const ranked = rankEvidenceCards([weak, strong], { query: "privacy judgment" });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.sourceId, 2);
  assert.ok((ranked[0]!.rankScore ?? 0) > 0);
});
