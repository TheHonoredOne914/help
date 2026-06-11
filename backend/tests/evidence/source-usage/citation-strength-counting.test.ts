import test from "node:test";
import assert from "node:assert/strict";
import { validateSourceUsageMap } from "../../../src/core/evidence/source-usage/index.js";
import { makeRegistry, source } from "./helpers.js";

test("strong and medium sources count, weak snippet sources do not satisfy strict usage minima", () => {
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
      snippet: "Government snippet mentions ministry accountability.",
      keyFacts: ["Government snippet mentions ministry accountability."],
      limitedSource: true,
    }),
  ], 2);

  const report = validateSourceUsageMap({
    roleName: "citation_auditor",
    requiredSourceCount: 2,
    receivedSourceIds: [1, 2, 3],
    usedSourceIds: [1, 2, 3],
    unusedSourceIds: [],
    sourceUsageMap: [
      { sourceId: 1, title: "Source 1", bucketIds: ["court_legal"], sourceClass: "court_primary", usageType: "legal_holding_extracted", legalHolding: "Supreme Court held that proportionality review applies to Article 14 restrictions", confidence: "high" },
      { sourceId: 2, title: "Source 2", bucketIds: ["policy_research"], sourceClass: "policy_research", usageType: "fact_extracted", extractedClaim: "policy report documents ministry accountability mechanisms for parliamentary oversight", confidence: "medium" },
      { sourceId: 3, title: "Source 3", bucketIds: ["government_official"], sourceClass: "official_government", usageType: "fact_extracted", extractedClaim: "Government snippet mentions ministry accountability", confidence: "high" },
    ],
    sourceUsageCount: 3,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 2);

  assert.equal(report.passed, true);
  assert.deepEqual(report.usedSourceIds, [1, 2]);
  assert.equal(report.strongSourceCount, 1);
  assert.equal(report.mediumSourceCount, 1);
  assert.equal(report.weakSourceCount, 1);
  assert.equal(report.snippetSourceCount, 1);
});
