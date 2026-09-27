import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateSourceUsageMap } from "../../src/core/evidence/source-usage/validate-source-usage-map.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "../../src/core/evidence/source-usage/types.js";

function makeRegistry(count: number) {
  const sources = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/s${index + 1}`,
    canonicalUrl: `https://example.org/s${index + 1}`,
    domain: "example.org",
    bucketIds: ["official_government" as const],
    sourceClass: "policy_research" as const,
    authorityScore: 8,
    snippet: `Source ${index + 1} discusses parliamentary accountability and policy implementation in India.`,
    fullText: `Source ${index + 1} discusses parliamentary accountability and policy implementation in India with distinct evidence.`,
    extractionQuality: "full" as const,
    keyFacts: [`Source ${index + 1} discusses parliamentary accountability and policy implementation in India.`],
    keyNumbers: [],
    legalHoldings: [],
    limitations: [],
    citationEligible: true,
  }));
  const contract = buildAgendaContract({ originalUserQuery: "Indian Parliament debate" });
  return { registry: buildEvidenceRegistryFromSources(sources, contract), contract };
}

function makeRepeatedRole(repeatCount: number): ModelRoleOutput {
  const genericClaim = "this source provides relevant parliamentary context for the debate agenda";
  const sourceUsageMap: SourceUsageMapItem[] = Array.from({ length: repeatCount }, (_, index) => ({
    sourceId: index + 1,
    title: `Source ${index + 1}`,
    bucketIds: ["official_government"],
    sourceClass: "policy_research",
    usageType: "fact_extracted",
    extractedClaim: genericClaim,
    confidence: "medium",
  }));
  return {
    roleName: "evidence_extractor",
    minimumSourceRequirement: 10,
    requiredSourceCount: 10,
    receivedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    usedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    unusedSourceIds: [],
    sourceUsageMap,
    sourceCountUsed: sourceUsageMap.length,
    sourceRequirementSatisfied: true,
    sourceUsageCount: sourceUsageMap.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  };
}

test("deterministic fallback path rejects same generic claim repeated across many sources", () => {
  const { registry, contract } = makeRegistry(12);
  const report = validateSourceUsageMap(makeRepeatedRole(12), registry, contract, 10, {}, true);
  assert.equal(report.passed, false);
  assert.ok(report.failures.some((failure) => /repeated_generic_claim|same generic claim/i.test(failure)));
});
