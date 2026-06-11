import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateSourceUsageMap } from "../../src/core/evidence/source-usage-map.js";

test("title-only source is not citation eligible", () => {
  const contract = buildAgendaContract({ requestId: "title-only", originalUserQuery: "Article 356 and federalism in India" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Article 356 source title",
    url: "https://example.org/title-only",
    snippet: "",
    fullText: "",
    bucketIds: ["court_legal"],
    authorityScore: 90,
  }], contract);

  assert.equal(registry.sources[0]?.keyFacts[0]?.startsWith("Title-only relevance:"), true);
  assert.equal(registry.sources[0]?.citationEligible, false);
  assert.equal(registry.getCitationEligibleCount(), 0);
});

test("SourceUsageMap does not count weak title-only sources as evidence", () => {
  const contract = buildAgendaContract({ requestId: "weak-usage", originalUserQuery: "Article 356 and federalism in India" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Article 356 source title",
    url: "https://example.org/title-only",
    snippet: "",
    fullText: "",
    bucketIds: ["court_legal"],
    authorityScore: 90,
  }], contract);

  const report = validateSourceUsageMap({
    roleName: "test",
    requiredSourceCount: 1,
    receivedSourceIds: [1],
    usedSourceIds: [1],
    unusedSourceIds: [],
    sourceUsageMap: [{
      sourceId: 1,
      title: "Article 356 source title",
      bucketIds: ["court_legal"],
      sourceClass: "legal_commentary",
      usageType: "fact_extracted",
      extractedClaim: "Title-only relevance: Article 356 source title",
      confidence: "low",
    }],
    sourceUsageCount: 1,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, 1);

  assert.equal(report.passed, false);
  assert.match(report.failures.join("\n"), /title-only/i);
});
