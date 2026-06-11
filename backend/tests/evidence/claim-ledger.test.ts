import test from "node:test";
import assert from "node:assert/strict";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";
import { buildClaimLedger } from "../../src/core/evidence/claim-ledger.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "../../src/core/evidence/source-usage-map.js";

function roleOutput(roleName: string, items: SourceUsageMapItem[]): ModelRoleOutput {
  const usedSourceIds = [...new Set(items.map((item) => item.sourceId))];
  return {
    roleName,
    minimumSourceRequirement: 1,
    requiredSourceCount: 1,
    receivedSourceIds: usedSourceIds,
    usedSourceIds,
    unusedSourceIds: [],
    sourceUsageMap: items,
    sourceUsageCount: items.length,
    sourceUsageRequirementSatisfied: true,
    output: { test: true },
  };
}

test("ClaimLedger converts SourceUsageMap items into evidence-span backed synthesis input", () => {
  const { evidenceRegistry } = createFakeResearchRun(4, "deep_research");
  const output = roleOutput("evidence_extractor", [{
    sourceId: 1,
    title: "Indian parliamentary source 1",
    bucketIds: ["government_official"],
    sourceClass: "official_government",
    usageType: "fact_extracted",
    extractedClaim: "Source 1 provides a specific evidence-backed claim for Indian parliamentary debate.",
    supportedSection: "D1_core_brief",
    confidence: "high",
  }]);

  const ledger = buildClaimLedger([output], evidenceRegistry);

  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].sourceId, 1);
  assert.equal(ledger.items[0].roleName, "evidence_extractor");
  assert.equal(ledger.items[0].supportType, "paraphrase");
  assert.equal(ledger.items[0].citationCreditEligible, true);
  assert.match(ledger.items[0].evidenceSpan?.text ?? "", /specific evidence-backed claim/i);
  assert.equal(ledger.summary.citationCreditEligibleCount, 1);
});

test("ClaimLedger downgrades snippet-only weak items and discards repeated generic claims item-by-item", () => {
  const { evidenceRegistry } = createFakeResearchRun(8, "deep_research");
  const snippetSource = evidenceRegistry.getSource(2)!;
  snippetSource.extractionQuality = "snippet";
  snippetSource.fullText = null;
  snippetSource.citationEligible = true;
  const genericItems: SourceUsageMapItem[] = Array.from({ length: 6 }, (_, index) => ({
    sourceId: index + 1,
    title: `Indian parliamentary source ${index + 1}`,
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    usageType: "fact_extracted",
    extractedClaim: "This source is relevant to the agenda.",
    supportedSection: "D1_core_brief",
    confidence: "high",
  }));
  const specificSnippetItem: SourceUsageMapItem = {
    sourceId: 2,
    title: "Indian parliamentary source 2",
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    usageType: "fact_extracted",
    extractedClaim: "Source 2 distinguishes government defence from rights-based challenge.",
    supportedSection: "D7_debate_utility",
    confidence: "high",
  };
  const ledger = buildClaimLedger([roleOutput("thesis_synthesizer", [...genericItems, specificSnippetItem])], evidenceRegistry);

  assert.ok(ledger.discardedClaims.some((claim) => claim.reason === "repeated_generic_claim"));
  const snippetItem = ledger.items.find((item) => item.sourceId === 2 && /government defence/.test(item.extractedClaim ?? ""));
  assert.ok(snippetItem, "specific snippet item should survive generic-claim filtering");
  assert.equal(snippetItem?.confidence, "low");
  assert.equal(snippetItem?.citationCreditEligible, false);
});
