import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { EvidenceRegistryCore, type EvidenceSourceInput } from "../../src/core/evidence/evidence-registry.js";

test("EvidenceRegistry source IDs stay monotonic after filtering/removal", () => {
  const registry = new EvidenceRegistryCore(buildAgendaContract({
    requestId: "registry-monotonic",
    originalUserQuery: "Article 21 privacy India",
  }));

  const one = registry.addSource(source("https://sci.gov.in/one", "One"));
  const two = registry.addSource(source("https://sci.gov.in/two", "Two"));
  const three = registry.addSource(source("https://sci.gov.in/three", "Three"));

  assert.deepEqual([one.id, two.id, three.id], [1, 2, 3]);

  registry.sources.splice(1, 1);
  const four = registry.addSource(source("https://sci.gov.in/four", "Four"));

  assert.equal(four.id, 4);
  assert.deepEqual(registry.sources.map((item) => item.id), [1, 3, 4]);
});

function source(url: string, title: string): EvidenceSourceInput {
  return {
    title,
    url,
    canonicalUrl: url,
    domain: "sci.gov.in",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 98,
    date: null,
    fullText: `${title} Article 21 privacy proportionality India Supreme Court evidence.`,
    snippet: `${title} Article 21 privacy proportionality India Supreme Court evidence.`,
    extractionQuality: "full",
    keyFacts: [`${title} Article 21 privacy proportionality India Supreme Court evidence.`],
    keyNumbers: [],
    legalHoldings: [`${title} Article 21 privacy proportionality India Supreme Court evidence.`],
    namedEntities: ["Supreme Court of India"],
    limitations: [],
    confidence: "high",
    citationEligible: true,
    topChunks: [{ text: `${title} Article 21 privacy proportionality India Supreme Court evidence.`, score: 1, chunkIndex: 0 }],
  };
}
