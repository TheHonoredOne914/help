import test from "node:test";
import assert from "node:assert/strict";
import { dedupeEvidenceCards } from "../../../src/core/evidence/evidence-pack/pack-deduper.js";
import type { EvidenceCard } from "../../../src/core/evidence/evidence-pack-builder.js";

function card(overrides: Partial<EvidenceCard>): EvidenceCard {
  return {
    sourceId: 1,
    citation: "[Source 1](https://example.org)",
    title: "Source",
    url: "https://example.org",
    sourceClass: "policy_research",
    bucketIds: ["policy_research"],
    date: null,
    relevanceScore: 50,
    keyFacts: ["fact"],
    keyNumbers: [],
    legalHoldings: [],
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: "fact",
    limitations: [],
    usableSections: ["policy_research"],
    citationStrength: "weak",
    topChunks: [],
    limitedSource: true,
    extractionQuality: "snippet",
    ...overrides,
  };
}

test("B14-17 duplicate source IDs keep the strongest deterministic card", () => {
  const weak = card({ sourceId: 1, citationStrength: "weak", relevanceScore: 99, limitedSource: true, extractionQuality: "snippet" });
  const strong = card({ sourceId: 1, citationStrength: "strong", relevanceScore: 70, limitedSource: false, extractionQuality: "full", topChunks: [{ text: "strong chunk", score: 10, chunkIndex: 0 }] });

  assert.deepEqual(dedupeEvidenceCards([weak, strong]).map((item) => item.citationStrength), ["strong"]);
  assert.deepEqual(dedupeEvidenceCards([strong, weak]).map((item) => item.citationStrength), ["strong"]);
});
