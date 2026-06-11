import test from "node:test";
import assert from "node:assert/strict";
import { computeCitationEligibility, extractionQualityFor } from "../../src/core/retrieval/enrichment/source-quality.js";

test("JavaScript shell and 404 pages are not citation eligible evidence", () => {
  const shellText = "Ooops!!! The page you are looking for is not found. Back to home. Election Commission of India. You need to enable JavaScript to run this app.";

  assert.equal(extractionQualityFor({
    text: shellText,
    wordCount: 24,
    uniqueWordRatio: 0.7,
    boilerplateRatio: 0,
  }, "readability_fetch"), "low");

  const eligibility = computeCitationEligibility({
    sourceId: 1,
    url: "https://eci.gov.in/example",
    title: "Election Commission of India: 404 Page",
    topChunks: [shellText],
    citationEligible: false,
    limitedSource: false,
    relevanceScore: 8,
    extractionQuality: "medium",
    keyTermsMatched: ["Election", "Commission"],
    citationStrength: "medium",
  });

  assert.equal(eligibility.citationEligible, false);
  assert.equal(eligibility.citationStrength, "ineligible");
});
