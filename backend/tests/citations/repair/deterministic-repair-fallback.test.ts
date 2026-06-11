import { describe, it, expect } from "vitest";
import { buildQualityFilteredFallback } from "../../../src/core/citations/repair/deterministic-repair-fallback.js";

describe("Deterministic Repair Fallback", () => {
  it("builds a fallback using quality-filtered sources", () => {
    const registry = {
      getSource: (id: number) => ({
        id,
        title: `Source ${id}`,
        citationStrength: id === 1 ? "strong" : "weak",
        extractionQuality: "full",
        authorityScore: 10,
        citationEligible: true,
        keyFacts: ["Fact"],
      }),
      getCitationMarkdown: (id: number) => `[Source ${id}]`,
    };

    const claimLedger = {
      summary: {} as any,
      discardedClaims: [],
      items: [
        { id: "c1", sourceId: 1, citationCreditEligible: true, roles: [], confidence: "high" as const },
      ],
    };

    const result = buildQualityFilteredFallback(registry as any, {} as any, claimLedger, [1, 2], "Test failure");
    
    // It should include the strong/eligible source first
    expect(result).toContain("Source 1");
    expect(result).toContain("Test failure");
  });
});
