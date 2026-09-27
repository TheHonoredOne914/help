import test from "node:test";
import assert from "node:assert/strict";
import { computeCitationEligibility, extractionQualityFor, isEvidenceShell } from "../../src/core/retrieval/enrichment/source-quality.js";

test("limited snippet with BM25-floor relevance and key terms is weak-eligible", () => {
  const eligibility = computeCitationEligibility({
    sourceId: 1,
    url: "https://pib.gov.in/release",
    title: "PIB: Online political advertising guidance",
    topChunks: ["The Election Commission asked platforms to label political ads during elections in India."],
    citationEligible: false,
    limitedSource: true,
    relevanceScore: 0.4,
    extractionQuality: "medium",
    keyTermsMatched: ["election", "political"],
    citationStrength: "ineligible",
  });
  assert.equal(eligibility.citationEligible, true);
  assert.equal(eligibility.citationStrength, "weak");
});

test("limited snippet with no relevance and no key terms stays ineligible", () => {
  const eligibility = computeCitationEligibility({
    sourceId: 2,
    url: "https://example.com/x",
    title: "Unrelated",
    topChunks: ["Cookie settings subscribe newsletter"],
    citationEligible: false,
    limitedSource: true,
    relevanceScore: 0.1,
    extractionQuality: "medium",
    keyTermsMatched: [],
    citationStrength: "ineligible",
  });
  assert.equal(eligibility.citationEligible, false);
});

test("please enable javascript shells are detected", () => {
  assert.equal(isEvidenceShell("Please enable JavaScript to view this page."), true);
  assert.equal(extractionQualityFor({
    text: "Please enable JavaScript to view this page.",
    wordCount: 8,
    uniqueWordRatio: 0.9,
    boilerplateRatio: 0,
  }, "readability_fetch"), "low");
});
