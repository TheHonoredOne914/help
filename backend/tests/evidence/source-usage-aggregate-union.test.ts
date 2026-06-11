import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "../../src/core/evidence/source-usage-map.js";
import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";
import { aggregateSourceUsageResults } from "../../src/core/pipeline/research-pipeline.js";

function fakeSources(count: number): EvidenceSource[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return {
      id,
      title: `Source ${id}`,
      url: `https://example.org/source-${id}`,
      canonicalUrl: `https://example.org/source-${id}`,
      domain: "example.org",
      bucketIds: ["policy_research"],
      sourceClass: "policy_research",
      authorityScore: 80,
      date: "2026-05-22",
      fullText: `Full text ${id}`,
      snippet: `Evidence snippet ${id}`,
      extractionQuality: "full",
      keyFacts: [`Specific claim ${id}`],
      keyNumbers: [],
      legalHoldings: [],
      namedEntities: ["India"],
      limitations: [`Limitation ${id}`],
      confidence: "high",
      citationEligible: true,
    };
  });
}

function roleOutput(roleName: string, ids: number[], usageType: SourceUsageMapItem["usageType"] = "fact_extracted"): ModelRoleOutput {
  const sourceUsageMap = ids.map((sourceId): SourceUsageMapItem => ({
    sourceId,
    title: `Source ${sourceId}`,
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    usageType,
    extractedClaim: usageType === "fact_extracted" ? `Specific claim ${sourceId}` : undefined,
    limitation: usageType === "relevant_but_weak" ? `Weak relevance ${sourceId}` : undefined,
    confidence: "high",
  }));
  return {
    roleName,
    minimumSourceRequirement: 3,
    requiredSourceCount: 3,
    receivedSourceIds: ids,
    usedSourceIds: ids,
    unusedSourceIds: [],
    sourceUsageMap,
    sourceCountUsed: ids.length,
    sourceRequirementSatisfied: true,
    sourceUsageCount: ids.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  };
}

test("source usage aggregate uses unique validation-valid union across roles", () => {
  const contract = buildAgendaContract({ requestId: "aggregate", originalUserQuery: "AIPPM policy debate on Indian rights and governance" });
  contract.minimumEvidenceCardsPerModel = 3;
  const registry = buildEvidenceRegistryFromSources(fakeSources(8), contract);
  const aggregate = aggregateSourceUsageResults([
    roleOutput("role_a", [1, 2, 3]),
    roleOutput("role_b", [3, 4, 5, 6]),
    roleOutput("role_c", [7, 8], "relevant_but_weak"),
  ], registry, contract, getSourceUsagePolicy("fast_research"));

  assert.equal(aggregate.validUsageCount, 6);
  assert.deepEqual(aggregate.validUsedSourceIds, [1, 2, 3, 4, 5, 6]);
});
