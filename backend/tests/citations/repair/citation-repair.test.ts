import { describe, it, expect, vi } from "vitest";
import { repairCitations } from "../../../src/core/citations/repair/citation-repair.js";
import type { CitationRepairContext } from "../../../src/core/citations/repair/types.js";

describe("Citation Repair", () => {
  it("does not inject random cards[0] fallback when citations are stripped", () => {
    // Setup a context with evidence packs but no valid IDs for the text
    const context = {
      agendaContract: {} as any,
      evidencePacks: [
        {
          cards: [{ id: "c1", citation: "[Source 1](url)", keyFacts: ["A fact"] }]
        }
      ],
      registry: {
        isValidSourceId: vi.fn().mockReturnValue(false),
        getSource: vi.fn().mockReturnValue(undefined),
        getCitationEligibleSources: vi.fn().mockReturnValue([]),
      } as any,
      claimGraph: { claims: [] } as any,
      claimLedger: { items: [] } as any,
    } as CitationRepairContext;

    // Text with an invalid citation
    const text = "This is a claim [Source 99](http://fake.com).";
    
    const result = repairCitations(text, context);
    
    // It should strip the citation, disclose the gap, and NOT append "[Source 1]".
    expect(result.text).not.toContain("[Source 1]");
    expect(result.text).toContain("This is a claim .");
    expect(result.text).toContain("[Source gap:");
    expect(result.changed).toBe(true);
  });
});
