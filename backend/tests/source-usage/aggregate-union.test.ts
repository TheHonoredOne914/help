import assert from "node:assert/strict";
import { test } from "node:test";

import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import { aggregateSourceUsageValidation } from "../../src/core/evidence/source-usage/aggregate-source-usage.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "../../src/core/evidence/source-usage/types.js";

function makeRegistry(count: number) {
  const sources: EvidenceSource[] = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Source ${i + 1}`,
    url: `https://example.org/s${i + 1}`,
    canonicalUrl: `https://example.org/s${i + 1}`,
    domain: "example.org",
    date: "2025-01-01",
    snippet: `Snippet for source ${i + 1} with concrete factual content about parliamentary procedure and policy.`,
    fullText: `Full text for source ${i + 1} with concrete factual content about parliamentary procedure and policy. Usable evidence claim.`,
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
  const registry = buildEvidenceRegistryFromSources(sources, contract);
  return { registry, contract };
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

test("fast_research: 4 roles with 12 sources each, union >= 40, passes aggregate", () => {
  const { registry, contract } = makeRegistry(50);
  const policy = getSourceUsagePolicy("fast_research");

  const roles = [
    makeRoleOutput("role_a", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], policy.perRoleMinimum),
    makeRoleOutput("role_b", [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], policy.perRoleMinimum),
    makeRoleOutput("role_c", [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], policy.perRoleMinimum),
    makeRoleOutput("role_d", [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41], policy.perRoleMinimum),
  ];

  const result = aggregateSourceUsageValidation(roles, registry, contract, policy);

  assert.ok(result.passed, `aggregate should pass, got failed with rolesPassed=${result.rolesPassed} validUsageCount=${result.validUsageCount}`);
  assert.ok(result.validUsedSourceIds.length >= 40, `union should be >= 40, got ${result.validUsedSourceIds.length}`);
  assert.equal(result.rolesFailed, 0, "no roles should fail");
});

test("fast_research: 1 of 4 roles fails with 6 sources, other 3 union >= 40, still passes", () => {
  const { registry, contract } = makeRegistry(50);
  const policy = getSourceUsagePolicy("fast_research");

  const roles = [
    makeRoleOutput("role_a", [1, 2, 3, 4, 5, 6], policy.perRoleMinimum),
    makeRoleOutput("role_b", [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], policy.perRoleMinimum),
    makeRoleOutput("role_c", [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], policy.perRoleMinimum),
    makeRoleOutput("role_d", [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41], policy.perRoleMinimum),
  ];

  const result = aggregateSourceUsageValidation(roles, registry, contract, policy);

  assert.ok(result.passed, `aggregate should pass even with 1 role failing perRoleMinimum, got validUsageCount=${result.validUsageCount}`);
  assert.ok(result.validUsedSourceIds.length >= 40, `union should be >= 40, got ${result.validUsedSourceIds.length}`);
});

test("fast_research: registry with only 22 eligible sources, union = all available, passes", () => {
  const { registry, contract } = makeRegistry(22);
  const policy = getSourceUsagePolicy("fast_research");

  const allSourceIds = Array.from({ length: 22 }, (_, i) => i + 1);
  const roles = [
    makeRoleOutput("role_a", allSourceIds.slice(0, 12), policy.perRoleMinimum),
    makeRoleOutput("role_b", allSourceIds.slice(6, 18), policy.perRoleMinimum),
    makeRoleOutput("role_c", allSourceIds.slice(10, 22), policy.perRoleMinimum),
    makeRoleOutput("role_d", allSourceIds.slice(0, 12), policy.perRoleMinimum),
  ];

  const result = aggregateSourceUsageValidation(roles, registry, contract, policy);

  assert.ok(result.passed, `aggregate should pass when union covers all available sources, got validUsageCount=${result.validUsageCount}`);
  assert.equal(result.validUsedSourceIds.length, 22, "union should equal all available sources");
  // completedWithSourceGaps is based on Math.min(requiredSources, available) = 22, so when union = 22 it's not flagged here.
  // The actual SourceGapReport (with requiredUniqueSources=40) is built at pipeline level by buildSourceUsageGapReport.
});

test("perRoleMinimum differs from requiredSources in policy config", () => {
  const fast = getSourceUsagePolicy("fast_research");
  assert.equal(fast.requiredSources, 40);
  assert.equal(fast.perRoleMinimum, 12);

  const deep = getSourceUsagePolicy("deep_research");
  assert.equal(deep.requiredSources, 80);
  assert.equal(deep.perRoleMinimum, 20);

  const phd = getSourceUsagePolicy("deep_research");
  assert.equal(phd.requiredSources, 30);
  assert.equal(phd.perRoleMinimum, 12);

  const full = getSourceUsagePolicy("council");
  assert.equal(full.requiredSources, 30);
  assert.equal(full.perRoleMinimum, 15);

  const council = getSourceUsagePolicy("council");
  assert.equal(council.requiredSources, 180);
  assert.equal(council.perRoleMinimum, 30);
});

test("all 4 roles fail with only 6 sources each, union < 40, fails aggregate", () => {
  const { registry, contract } = makeRegistry(50);
  const policy = getSourceUsagePolicy("fast_research");

  const roles = [
    makeRoleOutput("role_a", [1, 2, 3, 4, 5, 6], policy.perRoleMinimum),
    makeRoleOutput("role_b", [7, 8, 9, 10, 11, 12], policy.perRoleMinimum),
    makeRoleOutput("role_c", [13, 14, 15, 16, 17, 18], policy.perRoleMinimum),
    makeRoleOutput("role_d", [19, 20, 21, 22, 23, 24], policy.perRoleMinimum),
  ];

  const result = aggregateSourceUsageValidation(roles, registry, contract, policy);

  assert.ok(!result.passed, "aggregate should fail when union < 40");
  assert.ok(result.validUsedSourceIds.length < 40, `union should be < 40, got ${result.validUsedSourceIds.length}`);
});
