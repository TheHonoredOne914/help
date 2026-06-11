import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { EvidenceRegistryCore, type EvidenceSourceInput } from "../../src/core/evidence/evidence-registry.js";

function source(overrides: Partial<EvidenceSourceInput> = {}): EvidenceSourceInput {
  return {
    title: "Supreme Court voting rights judgment",
    url: "https://www.sci.gov.in/judgment/voting-rights",
    canonicalUrl: "https://www.sci.gov.in/judgment/voting-rights",
    domain: "sci.gov.in",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 98,
    date: "2024-02-15",
    fullText: "The Supreme Court held that voter information and political funding transparency are linked to Article 19.",
    snippet: "Supreme Court voting rights judgment.",
    extractionQuality: "full",
    keyFacts: ["The Supreme Court linked voter information to Article 19."],
    keyNumbers: [],
    legalHoldings: ["The Court held voter information is constitutionally relevant."],
    namedEntities: ["Supreme Court of India"],
    limitations: [],
    confidence: "high",
    citationEligible: true,
    topChunks: [{ text: "The Supreme Court linked voter information to Article 19.", score: 9, chunkIndex: 0 }],
    limitedSource: false,
    citationStrength: "strong",
    ...overrides,
  };
}

test("enrichmentCard is preserved through addSource", () => {
  const registry = new EvidenceRegistryCore(buildAgendaContract({ requestId: "preserve-card", originalUserQuery: "Article 19 voter information" }));
  const added = registry.addSource(source({ enrichmentCard: { topChunks: ["verified chunk"], reducerName: "local" } }));

  assert.deepEqual(added.enrichmentCard, { topChunks: ["verified chunk"], reducerName: "local" });
  assert.equal(registry.getEnrichmentCard(1)?.reducerName, "local");
});

test("duplicate merge preserves better enrichment and recomputes strength", () => {
  const registry = new EvidenceRegistryCore(buildAgendaContract({ requestId: "merge-card", originalUserQuery: "Article 19 voter information" }));
  registry.addSource(source({
    fullText: null,
    snippet: "Snippet only.",
    extractionQuality: "snippet",
    authorityScore: 70,
    topChunks: [{ text: "Snippet only.", score: 1, chunkIndex: 0 }],
    limitedSource: true,
    citationStrength: "weak",
  }));

  const merged = registry.addSource(source({
    fullText: "The Supreme Court held that voter information and political funding transparency are linked to Article 19 with a full extract.",
    authorityScore: 98,
    enrichmentCard: { topChunks: ["full verified chunk"] },
    topChunks: [{ text: "Full verified Article 19 chunk.", score: 10, chunkIndex: 1 }],
    limitedSource: false,
  }));

  assert.equal(registry.sources.length, 1);
  assert.equal(merged.id, 1);
  assert.equal(merged.extractionQuality, "full");
  assert.equal(merged.citationStrength, "strong");
  assert.equal(merged.enrichmentCard?.topChunks instanceof Array, true);
  assert.deepEqual(merged.topChunks.map((chunk) => chunk.chunkIndex).sort((a, b) => a - b), [0, 1]);
});
