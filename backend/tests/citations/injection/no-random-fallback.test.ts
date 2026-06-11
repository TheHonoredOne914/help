import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { EvidenceRegistryCore, type EvidenceSourceInput } from "../../../src/core/evidence/evidence-registry.js";
import { selectCitationsForSectionFromLedger } from "../../../src/core/citations/injection/section-citation-selector.js";
import type { ClaimGraph } from "../../../src/core/evidence/claim-graph/types.js";
import type { ClaimLedger } from "../../../src/core/evidence/claim-ledger.js";

test("citation selector emits a citation gap instead of random fallback citations", () => {
  const registry = new EvidenceRegistryCore(buildAgendaContract({
    requestId: "citation-gap-no-random",
    originalUserQuery: "Article 21 privacy India",
  }));
  const source = registry.addSource(sourceInput());
  const ledger: ClaimLedger = {
    items: [],
    discardedClaims: [],
    summary: {
      itemCount: 0,
      sourceCount: 0,
      citationCreditEligibleCount: 0,
      lowConfidenceCount: 0,
      roles: [],
    },
  };
  const graph: ClaimGraph = { claims: [] };

  const plan = selectCitationsForSectionFromLedger("Constitutional challenge", [source.id], registry, ledger, graph, 2);

  assert.equal(plan.strategy, "citation_gap");
  assert.equal(plan.citationGap, true);
  assert.deepEqual(plan.selectedSourceIds, []);
});

function sourceInput(): EvidenceSourceInput {
  return {
    title: "Supreme Court privacy judgment",
    url: "https://sci.gov.in/privacy",
    canonicalUrl: "https://sci.gov.in/privacy",
    domain: "sci.gov.in",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 98,
    date: null,
    fullText: "The Supreme Court considered privacy under Article 21 and proportionality.",
    snippet: "The Supreme Court considered privacy under Article 21 and proportionality.",
    extractionQuality: "full",
    keyFacts: ["The Supreme Court considered privacy under Article 21 and proportionality."],
    keyNumbers: [],
    legalHoldings: ["The Supreme Court considered privacy under Article 21 and proportionality."],
    namedEntities: ["Supreme Court of India"],
    limitations: [],
    confidence: "high",
    citationEligible: true,
    topChunks: [{ text: "The Supreme Court considered privacy under Article 21 and proportionality.", score: 1, chunkIndex: 0 }],
  };
}
