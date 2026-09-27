import test from "node:test";
import assert from "node:assert/strict";
import { getSourceUsageRolesForMode } from "../../../src/core/config/source-usage-policy.js";
import { buildDeterministicRoleUsageItems } from "../../../src/core/synthesis/role-generation/deterministic-role-runner.js";

test("fast research role slate includes data_analyst and strategist", () => {
  assert.deepEqual(getSourceUsageRolesForMode("fast_research"), [
    "retrieval_critic",
    "evidence_extractor",
    "data_analyst",
    "indian_parliamentary_strategist",
  ]);
  assert.deepEqual(getSourceUsageRolesForMode("deep_research"), [
    "evidence_extractor",
    "data_analyst",
    "legal_analyst",
  ]);
});

test("deterministic role runner emits role-faithful usage types", () => {
  const cards = [{
    sourceId: 1,
    citation: "[Source 1](https://example.org/1)",
    title: "NFHS-6 obesity",
    url: "https://example.org/1",
    sourceClass: "policy_research" as const,
    bucketIds: ["policy_research"],
    date: "2024-01-01",
    relevanceScore: 90,
    keyFacts: ["NFHS-6 reports 30.7% of women aged 15-49 are overweight or obese due to dietary shift."],
    keyNumbers: ["30.7%"],
    legalHoldings: [],
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: "Treasury cites Fit India; Opposition presses junk-food regulation.",
    limitations: [],
    usableSections: ["policy_research"],
    contentPreview: "NFHS-6 reports 30.7% of women aged 15-49 are overweight or obese due to dietary shift.",
    extractionQuality: "full" as const,
    citationStrength: "strong" as const,
  }];

  const critic = buildDeterministicRoleUsageItems(cards as any, 1, "retrieval_critic");
  const data = buildDeterministicRoleUsageItems(cards as any, 1, "data_analyst");
  const strategist = buildDeterministicRoleUsageItems(cards as any, 1, "indian_parliamentary_strategist");
  const auditor = buildDeterministicRoleUsageItems(cards as any, 1, "citation_auditor");

  assert.equal(critic[0]?.usageType, "used_for_reliability_matrix");
  assert.doesNotMatch(critic[0]?.limitation ?? "", /title-level/i);
  assert.equal(data[0]?.usageType, "number_extracted");
  assert.equal(data[0]?.extractedNumber, "30.7%");
  assert.equal(strategist[0]?.usageType, "used_for_debate_utility");
  assert.equal(auditor[0]?.usageType, "used_for_citation_audit");
});

test("deterministic runner rejects Lok Sabha chrome claims", () => {
  const cards = [{
    sourceId: 9,
    citation: "[Source 9](https://example.org/9)",
    title: "LSQ",
    url: "https://example.org/9",
    sourceClass: "official_government" as const,
    bucketIds: ["policy_research"],
    date: "2024-01-01",
    relevanceScore: 80,
    keyFacts: [],
    keyNumbers: [],
    legalHoldings: [],
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: "",
    limitations: [],
    usableSections: ["policy_research"],
    contentPreview: "GOVERNMENT OF INDIA MINISTRY OF HEALTH LOK SABHA UNSTARRED QUESTION NO. 1061 Will the Minister of HEALTH be pleased to state",
    extractionQuality: "full" as const,
    citationStrength: "strong" as const,
  }];
  const items = buildDeterministicRoleUsageItems(cards as any, 1, "indian_parliamentary_strategist");
  assert.equal(items[0]?.usageType, "relevant_but_weak");
});
