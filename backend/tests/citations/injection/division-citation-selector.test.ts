import { describe, it, expect, vi } from "vitest";
import { selectCitationsForDivision } from "../../../src/core/citations/injection/division-citation-selector.js";

describe("Division Citation Selector", () => {
  it("splits Treasury Bench and Opposition sources for D7", () => {
    const mockSources = [
      { id: 1, bucketIds: [], sourceClass: "court_primary", citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
      { id: 2, bucketIds: [], sourceClass: "human_rights_watchdog", citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
      { id: 3, bucketIds: [], sourceClass: "official_government", citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
      { id: 4, bucketIds: [], sourceClass: "digital_rights_watchdog", citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
    ];

    const registry = {
      getSource: vi.fn((id) => mockSources.find((s) => s.id === id)),
    };

    const ledger = supportedLedger([1, 2, 3, 4]);
    const graph = supportedGraph([1, 2, 3, 4]);

    const plan = selectCitationsForDivision("D7_debate_utility", [1, 2, 3, 4], registry as any, ledger, graph as any, 4);

    expect(plan.treasuryBenchIds).toContain(1); // Court primary
    expect(plan.treasuryBenchIds).toContain(3); // Official government
    expect(plan.oppositionIds).toContain(2); // Human rights watchdog
    expect(plan.oppositionIds).toContain(4); // Digital rights watchdog
  });

  it("prioritizes sources relevant to the division bucket preferences", () => {
    const mockSources = [
      { id: 1, bucketIds: ["academic"], sourceClass: "academic_journal", citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
      { id: 2, bucketIds: ["government"], sourceClass: "official_government", citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
    ];

    const registry = {
      getSource: vi.fn((id) => mockSources.find((s) => s.id === id)),
    };

    const ledger = supportedLedger([1, 2]);
    const graph = supportedGraph([1, 2]);

    // D1 prioritizes government/official
    const plan = selectCitationsForDivision("D1_core_brief", [1, 2], registry as any, ledger, graph as any, 1);
    expect(plan.selectedSourceIds).toEqual([2]);
  });
});

function supportedLedger(sourceIds: number[]) {
  return {
    items: sourceIds.map((sourceId) => ({
      claimId: `claim-${sourceId}`,
      sourceId,
      url: `https://example.org/${sourceId}`,
      title: `Source ${sourceId}`,
      usageType: "fact_extracted",
      extractedClaim: `Supported claim ${sourceId}`,
      roleName: "test_role",
      supportType: "direct_quote",
      confidence: "high",
      evidenceSpan: {
        sourceId,
        url: `https://example.org/${sourceId}`,
        title: `Source ${sourceId}`,
        text: `Supported claim ${sourceId}`,
        extractionQuality: "full",
      },
      citationCreditEligible: true,
    })),
    summary: { itemCount: sourceIds.length, sourceCount: sourceIds.length, citationCreditEligibleCount: sourceIds.length, lowConfidenceCount: 0, roles: ["test_role"] },
    discardedClaims: [],
  } as any;
}

function supportedGraph(sourceIds: number[]) {
  return {
    claims: sourceIds.map((sourceId) => ({
      id: `claim-${sourceId}`,
      text: `Supported claim ${sourceId}`,
      type: "fact",
      requiredSourceClasses: [],
      supportingSourceIds: [sourceId],
      confidence: "high",
      mustUseCarefulLanguage: false,
      forbiddenIfUnsupported: false,
      supportScore: 90,
      validationStatus: "approved",
    })),
  };
}
