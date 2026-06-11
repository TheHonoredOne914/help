import { describe, it, expect } from "vitest";
import { generatePromptCitationBlock } from "../../../src/core/citations/injection/prompt-citation-block.js";

describe("Prompt Citation Block", () => {
  it("formats standard sources correctly", () => {
    const sources = [
      {
        id: 1,
        title: "Test Source",
        bucketIds: ["b1"],
        sourceClass: "court_primary" as any,
        url: "http://test.com",
        citationStrength: "strong" as any,
        extractionQuality: "full" as any,
        authorityScore: 10,
        contentCategory: "legal" as any,
        citationEligible: true,
        date: "2023",
        keyFacts: ["Fact 1"],
      },
    ];

    const block = generatePromptCitationBlock(sources as any, undefined, undefined);
    expect(block).toContain("[Source 1]");
    expect(block).toContain("Fact 1");
  });
});
