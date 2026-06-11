import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicUsageItems } from "../../../src/core/evidence/source-usage/deterministic-map-builder.js";
import type { EvidenceCard } from "../../../src/core/evidence/evidence-pack-builder.js";

test("deterministic usage demotes title-only evidence to relevant_but_weak", () => {
  const cards: EvidenceCard[] = [{
    sourceId: 7,
    citation: "[Source 7](https://example.org/title-only)",
    title: "Title-only source",
    url: "https://example.org/title-only",
    sourceClass: "policy_research",
    bucketIds: ["policy_research"],
    date: null,
    relevanceScore: 75,
    keyFacts: ["Title-only relevance: Title-only source"],
    keyNumbers: [],
    legalHoldings: [],
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: "Use only as background context for Title-only source.",
    limitations: [],
    usableSections: ["policy_research"],
    citationStrength: "weak",
    topChunks: [],
    limitedSource: true,
    extractionQuality: "snippet",
  }];

  const items = buildDeterministicUsageItems(cards, 1);

  assert.equal(items[0]?.usageType, "relevant_but_weak");
  assert.equal(items[0]?.confidence, "low");
  assert.equal(items[0]?.supportedSection, undefined);
  assert.match(items[0]?.limitation ?? "", /weak|title-only|limited/i);
});
