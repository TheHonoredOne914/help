import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEvidenceSourceInput } from "../../src/core/evidence/source-normalizer.js";

test("short-snippet indian major media stays citation-eligible via class authority", () => {
  const normalized = normalizeEvidenceSourceInput({
    title: "The Hindu: EC seeks rules on deepfakes",
    url: "https://www.thehindu.com/news/eci-deepfakes",
    domain: "thehindu.com",
    sourceClass: "indian_major_media",
    // Agenda score after short-snippet penalty — must not be used as authority.
    authorityScore: undefined,
    snippet: "The Election Commission asked platforms to label political ads and deepfakes during elections in India with clear provenance.",
    extractionQuality: "snippet",
    citationEligible: true,
    fallbackExtractionUsed: true,
  });
  assert.ok(normalized);
  assert.equal(normalized.authorityScore >= 60, true);
  assert.equal(normalized.citationEligible, true);
});

test("agenda score 50 alone must not grant eligibility when class authority is low_quality", () => {
  const normalized = normalizeEvidenceSourceInput({
    title: "Random blog",
    url: "https://blogspot.com/post",
    domain: "blogspot.com",
    sourceClass: "low_quality",
    authorityScore: 50,
    snippet: "Some long enough snippet about elections and deepfakes in India for testing eligibility gates carefully here.",
    extractionQuality: "snippet",
    citationEligible: true,
  });
  assert.ok(normalized);
  assert.equal(normalized.citationEligible, false);
});

test("bridge omit: agenda-like score 50 does not demote indian_major_media with usable snippet", () => {
  // Mirrors retrievalToEvidenceInput after removing authorityScore: source.score —
  // authorityScore omitted so class authority applies (not agenda score 50).
  const normalized = normalizeEvidenceSourceInput({
    title: "The Hindu: EC seeks rules on deepfakes",
    url: "https://www.thehindu.com/news/eci-deepfakes-bridge",
    domain: "thehindu.com",
    sourceClass: "indian_major_media",
    // authorityScore omitted (bridge no longer passes source.score)
    snippet: "The Election Commission asked platforms to label political ads and deepfakes during elections in India with clear provenance.",
    extractionQuality: "snippet",
    citationEligible: true,
  });
  assert.ok(normalized);
  assert.equal(normalized.authorityScore >= 60, true);
  assert.equal(normalized.citationEligible, true);
});

test("bridge omit: explicit low authorityScore for low_quality stays ineligible", () => {
  const normalized = normalizeEvidenceSourceInput({
    title: "Random blog post",
    url: "https://blogspot.com/post-bridge",
    domain: "blogspot.com",
    sourceClass: "low_quality",
    authorityScore: 40,
    snippet: "Some long enough snippet about elections and deepfakes in India for testing eligibility gates carefully here.",
    extractionQuality: "snippet",
    citationEligible: true,
  });
  assert.ok(normalized);
  assert.equal(normalized.citationEligible, false);
});
