import { describe, it, expect, vi } from "vitest";
import { selectCitationsForSection } from "../../../src/core/citations/injection/deterministic-citation-injector.js";

describe("Deterministic Section Citation Selector", () => {
  it("handles empty source list gracefully", () => {
    const registry = {
      getSource: vi.fn(),
      getCitationMarkdown: vi.fn(),
      getCitationEligibleSources: vi.fn().mockReturnValue([]),
      getCitationEligibleCount: vi.fn().mockReturnValue(0),
      isSourceEligible: vi.fn(),
    };

    const result = selectCitationsForSection("AnySection", [], registry as any, 4);
    expect(result).toEqual([]);
  });

  it("prioritizes bucket matching", () => {
    const mockSources = [
      { id: 1, bucketIds: ["b1"], citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
      { id: 2, bucketIds: ["policy_pathways"], citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
      { id: 3, bucketIds: ["b3"], citationStrength: "strong", extractionQuality: "full", authorityScore: 10, citationEligible: true },
    ];

    const registry = {
      getSource: vi.fn((id) => mockSources.find((s) => s.id === id)),
      getCitationMarkdown: vi.fn(),
      getCitationEligibleSources: vi.fn().mockReturnValue(mockSources),
      getCitationEligibleCount: vi.fn().mockReturnValue(3),
      isSourceEligible: vi.fn().mockReturnValue(true),
    };

    const result = selectCitationsForSection("policy_pathways", [1, 2, 3], registry as any, 1);
    expect(result).toEqual([2]); // Prioritizes source 2 due to bucket match
  });
});
