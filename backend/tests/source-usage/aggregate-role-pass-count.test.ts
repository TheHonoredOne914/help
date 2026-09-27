import test from "node:test";
import assert from "node:assert/strict";
import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { aggregateSourceUsageValidation } from "../../src/core/evidence/source-usage/aggregate-source-usage.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "../../src/core/evidence/source-usage/types.js";

function makeRegistry(count: number) {
  const sources = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Source ${i + 1}`,
    url: `https://example.org/s${i + 1}`,
    canonicalUrl: `https://example.org/s${i + 1}`,
    domain: "example.org",
    snippet: `Snippet for source ${i + 1} with concrete factual content about parliamentary procedure and policy.`,
    fullText: `Full text for source ${i + 1} with concrete factual content about parliamentary procedure and policy.`,
    bucketIds: ["official_government" as const],
    sourceClass: "policy_research" as const,
    authorityScore: 8,
    extractionQuality: "full" as const,
    keyFacts: [`Source ${i + 1} states a distinct factual claim.`],
    keyNumbers: [],
    legalHoldings: [],
    limitations: [],
    citationEligible: true,
  }));
  const contract = buildAgendaContract({ requestId: "test", originalUserQuery: "Indian Parliament debate on policy" });
  return { registry: buildEvidenceRegistryFromSources(sources, contract), contract };
}

function makeUsageItem(sourceId: number): SourceUsageMapItem {
  return {
    sourceId,
    title: `Source ${sourceId}`,
    bucketIds: ["official_government"],
    sourceClass: "policy_research",
    usageType: "fact_extracted",
    extractedClaim: `Source ${sourceId} states a distinct factual claim about parliamentary procedure.`,
    confidence: "medium",
  };
}

function makeRoleOutput(roleName: string, sourceIds: number[], minimumSourceRequirement: number): ModelRoleOutput {
  return {
    roleName,
    minimumSourceRequirement,
    requiredSourceCount: minimumSourceRequirement,
    receivedSourceIds: sourceIds,
    usedSourceIds: sourceIds,
    unusedSourceIds: [],
    sourceUsageMap: sourceIds.map(makeUsageItem),
    sourceCountUsed: sourceIds.length,
    sourceRequirementSatisfied: true,
    sourceUsageCount: sourceIds.length,
    sourceUsageRequirementSatisfied: true,
    output: { test: true },
  };
}

test("fast_research aggregate requires at least three of four roles to pass", () => {
  const { registry, contract } = makeRegistry(50);
  const policy = getSourceUsagePolicy("fast_research");
  const roles = [
    makeRoleOutput("role_a", [1, 2, 3, 4, 5, 6], policy.perRoleMinimum),
    makeRoleOutput("role_b", [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], policy.perRoleMinimum),
    makeRoleOutput("role_c", [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], policy.perRoleMinimum),
    makeRoleOutput("role_d", [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41], policy.perRoleMinimum),
  ];
  const passing = aggregateSourceUsageValidation(roles, registry, contract, policy);
  assert.ok(passing.passed);

  const onlyOnePassing = aggregateSourceUsageValidation([
    makeRoleOutput("role_a", [1, 2, 3, 4, 5, 6], policy.perRoleMinimum),
    makeRoleOutput("role_b", [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], policy.perRoleMinimum),
    makeRoleOutput("role_c", [19, 20, 21, 22, 23, 24], policy.perRoleMinimum),
    makeRoleOutput("role_d", [25, 26, 27, 28, 29, 30], policy.perRoleMinimum),
  ], registry, contract, policy);
  assert.ok(!onlyOnePassing.passed, "one passing role must not satisfy a four-role slate");
});
