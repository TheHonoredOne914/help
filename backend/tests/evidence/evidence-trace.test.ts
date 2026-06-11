import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { buildEvidenceTrace } from "../../src/core/evidence/evidence-trace.js";

test("trace resolves to the matching top chunk when available", () => {
  const registry = buildEvidenceRegistryFromSources([{
    title: "Electoral bonds judgment",
    url: "https://www.sci.gov.in/judgment/electoral-bonds",
    sourceClass: "court_primary",
    authorityScore: 98,
    fullText: "Full text.",
    keyFacts: ["The Supreme Court connected electoral bonds disclosure to voter information."],
    topChunks: [
      { text: "Generic background paragraph.", score: 1, chunkIndex: 0 },
      { text: "The Supreme Court connected electoral bonds disclosure to voter information under Article 19.", score: 9, chunkIndex: 7 },
    ],
  }], buildAgendaContract({ requestId: "trace-chunk", originalUserQuery: "electoral bonds voter information" }));

  const trace = buildEvidenceTrace("electoral bonds disclosure and voter information", 1, registry);

  assert.equal(trace?.chunkIndex, 7);
  assert.match(trace?.chunkText ?? "", /voter information/);
  assert.equal(trace?.citationStrength, "strong");
});

test("trace falls back to fullText when no top chunks exist", () => {
  const registry = buildEvidenceRegistryFromSources([{
    title: "Federalism article",
    url: "https://prsindia.org/federalism",
    authorityScore: 76,
    fullText: "A federalism sentence discusses Article 356 and governor accountability. Another sentence is generic.",
    keyFacts: [],
  }], buildAgendaContract({ requestId: "trace-fulltext", originalUserQuery: "Article 356 federalism" }));

  const trace = buildEvidenceTrace("Article 356 governor accountability", 1, registry);

  assert.equal(trace?.chunkIndex, undefined);
  assert.match(trace?.chunkText ?? "", /Article 356/);
});

test("trace returns null for missing sourceId", () => {
  const registry = buildEvidenceRegistryFromSources([], buildAgendaContract({ requestId: "trace-missing", originalUserQuery: "missing" }));
  assert.equal(buildEvidenceTrace("claim", 999, registry), null);
});
