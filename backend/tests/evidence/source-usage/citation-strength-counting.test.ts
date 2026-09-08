import test from "node:test";
import assert from "node:assert/strict";
import { validateSourceUsageMap } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("strong and medium sources count; substantive citation-eligible snippets also count", () => {
  const snippetText = "The Election Commission asked platforms to label political ads and deepfakes during elections in India with clear provenance.";
  const { contract, registry } = makeRegistry([
    source(1, {
      sourceClass: "court_primary",
      authorityScore: 96,
      extractionQuality: "full",
      fullText: "The Supreme Court held that proportionality review applies to Article 14 restrictions.",
      keyFacts: ["The Supreme Court held that proportionality review applies to Article 14 restrictions."],
      legalHoldings: ["The Supreme Court held that proportionality review applies to Article 14 restrictions."],
    }),
    source(2, {
      sourceClass: "policy_research",
      authorityScore: 76,
      extractionQuality: "full",
      fullText: "The policy report documents ministry accountability mechanisms for parliamentary oversight.",
      keyFacts: ["The policy report documents ministry accountability mechanisms for parliamentary oversight."],
    }),
    source(3, {
      sourceClass: "official_government",
      authorityScore: 94,
      extractionQuality: "snippet",
      fullText: null,
      snippet: snippetText,
      keyFacts: [snippetText],
      limitedSource: true,
      citationEligible: true,
      citationStrength: "weak",
    }),
  ], 3);

  const report = validateSourceUsageMap({
    roleName: "citation_auditor",
    requiredSourceCount: 3,
    receivedSourceIds: [1, 2, 3],
    usedSourceIds: [1, 2, 3],
    unusedSourceIds: [],
    sourceUsageMap: [
      { sourceId: 1, title: "Source 1", bucketIds: ["court_legal"], sourceClass: "court_primary", usageType: "legal_holding_extracted", legalHolding: "Supreme Court held that proportionality review applies to Article 14 restrictions", confidence: "high" },
      { sourceId: 2, title: "Source 2", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "policy report documents ministry accountability mechanisms for parliamentary oversight", confidence: "medium" },
      { sourceId: 3, title: "Source 3", bucketIds: ["government_official"], sourceClass: "official_government", usageType: "fact_extracted", extractedClaim: snippetText, confidence: "low" },
    ],
    sourceUsageCount: 3,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 3);

  assert.equal(report.passed, true);
  assert.deepEqual(report.usedSourceIds, [1, 2, 3]);
  assert.equal(report.strongSourceCount, 1);
  assert.equal(report.mediumSourceCount, 1);
  assert.equal(report.weakSourceCount, 1);
  assert.equal(report.snippetSourceCount, 1);
});

test("title-only or empty snippet sources still do not count for strict usage", () => {
  const { contract, registry } = makeRegistry([
    source(1, {
      sourceClass: "policy_research",
      authorityScore: 76,
      extractionQuality: "full",
      fullText: "The policy report documents ministry accountability mechanisms for parliamentary oversight.",
      keyFacts: ["The policy report documents ministry accountability mechanisms for parliamentary oversight."],
    }),
    source(2, {
      sourceClass: "official_government",
      authorityScore: 94,
      extractionQuality: "snippet",
      fullText: null,
      snippet: "short",
      keyFacts: ["Title-only relevance: ECI advisory"],
      limitedSource: true,
      citationEligible: true,
      citationStrength: "weak",
    }),
  ], 1);

  const report = validateSourceUsageMap({
    roleName: "citation_auditor",
    requiredSourceCount: 1,
    receivedSourceIds: [1, 2],
    usedSourceIds: [1, 2],
    unusedSourceIds: [],
    sourceUsageMap: [
      { sourceId: 1, title: "Source 1", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "policy report documents ministry accountability mechanisms for parliamentary oversight", confidence: "medium" },
      { sourceId: 2, title: "Source 2", bucketIds: ["government_official"], sourceClass: "official_government", usageType: "fact_extracted", extractedClaim: "Title-only relevance: ECI advisory", confidence: "low" },
    ],
    sourceUsageCount: 2,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 1);

  assert.deepEqual(report.usedSourceIds, [1]);
  assert.ok(report.rejectedSourceIds.includes(2));
  assert.ok(report.structuredFailures.some((failure) => failure.type === "title_only_source"));
});
