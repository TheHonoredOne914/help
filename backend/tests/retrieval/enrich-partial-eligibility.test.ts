import test from "node:test";
import assert from "node:assert/strict";
import { buildEnriched } from "../../src/core/retrieval/enrichment/enrich-source.js";

test("partial snippet extraction can be weak citation-eligible", async () => {
  const enriched = await buildEnriched({
    title: "ECI advisory on deepfakes during elections",
    url: "https://eci.gov.in/advisory-deepfakes",
    domain: "eci.gov.in",
    snippet: "The Election Commission of India issued detailed guidance on deepfakes, synthetic media, and online political advertising during elections, urging platforms to label paid political content.",
  }, {
    url: "https://eci.gov.in/advisory-deepfakes",
    title: "ECI advisory on deepfakes during elections",
    text: "The Election Commission of India issued detailed guidance on deepfakes, synthetic media, and online political advertising during elections, urging platforms to label paid political content.",
    extractionMethod: "snippet_fallback",
    extractionProvider: "snippet_fallback",
    extractionStatus: "partial",
    fallbackExtractionUsed: true,
  }, {
    query: "Election Commission deepfakes online political advertising India",
  });

  assert.equal(enriched.extractionStatus, "partial");
  assert.equal(enriched.limitedSource, true);
  assert.equal(enriched.citationEligible, true);
  assert.equal(enriched.citationStrength, "weak");
});
