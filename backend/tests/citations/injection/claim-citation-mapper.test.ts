import { describe, it, expect } from "vitest";
import { resolveCitationsForClaims } from "../../../src/core/citations/injection/claim-citation-mapper.js";
import type { ClaimLedger } from "../../../src/core/evidence/claim-ledger.js";

describe("Claim Citation Mapper", () => {
  it("only resolves citation credit eligible claims", () => {
    const ledger: ClaimLedger = {
      summary: { itemCount: 0, sourceCount: 0, citationCreditEligibleCount: 0, lowConfidenceCount: 0, roles: [] },
      discardedClaims: [],
      items: [
        { id: "1", claim: "Valid claim", sourceId: 101, citationCreditEligible: true, roles: [], confidence: "high" },
        { id: "2", claim: "Snippet claim", sourceId: 102, citationCreditEligible: false, roles: [], confidence: "low" },
      ],
    };

    const result = resolveCitationsForClaims(ledger, [101, 102]);
    expect(result.length).toBe(1);
    expect(result[0].sourceId).toBe(101);
  });

  it("filters by approved source IDs", () => {
    const ledger: ClaimLedger = {
      summary: { itemCount: 0, sourceCount: 0, citationCreditEligibleCount: 0, lowConfidenceCount: 0, roles: [] },
      discardedClaims: [],
      items: [
        { id: "1", claim: "Valid claim 1", sourceId: 101, citationCreditEligible: true, roles: [], confidence: "high" },
        { id: "2", claim: "Valid claim 2", sourceId: 102, citationCreditEligible: true, roles: [], confidence: "high" },
      ],
    };

    // Only source 101 is approved
    const result = resolveCitationsForClaims(ledger, [101]);
    expect(result.length).toBe(1);
    expect(result[0].sourceId).toBe(101);
  });
});
