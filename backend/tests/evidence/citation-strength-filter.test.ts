import test from "node:test";
import assert from "node:assert/strict";
import { computeCitationStrength } from "../../src/core/evidence/citation-strength-filter.js";
import type { EvidenceSource } from "../../src/core/evidence/evidence-registry.js";

function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    id: 1,
    title: "Source",
    url: "https://www.sci.gov.in/judgment/test",
    canonicalUrl: "https://www.sci.gov.in/judgment/test",
    domain: "sci.gov.in",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 98,
    date: null,
    fullText: "Full constitutional evidence.",
    snippet: "Snippet",
    extractionQuality: "full",
    keyFacts: ["Substantive fact about Article 19."],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: [],
    limitations: [],
    confidence: "high",
    citationEligible: true,
    topChunks: [],
    limitedSource: false,
    citationStrength: "strong",
    ...overrides,
  };
}

test("court primary full extraction is strong", () => {
  assert.equal(computeCitationStrength(source()), "strong");
});

test("snippet source is weak regardless of source class", () => {
  assert.equal(computeCitationStrength(source({ extractionQuality: "snippet", limitedSource: true })), "weak");
});

test("failed extraction is ineligible", () => {
  assert.equal(computeCitationStrength(source({ extractionQuality: "failed", citationEligible: true })), "ineligible");
});

test("title-only and low-authority sources are weak", () => {
  assert.equal(computeCitationStrength(source({ sourceClass: "policy_research", authorityScore: 80, keyFacts: ["Title-only relevance: Source"] })), "weak");
  assert.equal(computeCitationStrength(source({ authorityScore: 60, sourceClass: "policy_research" })), "weak");
});

test("citationEligible=false is ineligible", () => {
  assert.equal(computeCitationStrength(source({ citationEligible: false })), "ineligible");
});
