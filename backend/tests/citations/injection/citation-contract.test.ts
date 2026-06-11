import { describe, it, expect, vi } from "vitest";
import { enforceCitationContract } from "../../../src/core/citations/injection/citation-contract.js";

describe("Citation Contract Enforcement", () => {
  it("passes text that cites all factual sentences", () => {
    const text = "The court ruled in favor of the plaintiff [Source 1](url). It awarded $100 [Source 2](url).";
    const report = enforceCitationContract(text);
    expect(report.passed).toBe(true);
    expect(report.uncitedSentences).toHaveLength(0);
  });

  it("fails text that has uncited factual assertions", () => {
    const text = "The court ruled in favor of the plaintiff [Source 1](url). It awarded $100. This was unprecedented.";
    const report = enforceCitationContract(text);
    // Might not be perfectly true depending on regex, but should catch "It awarded $100."
    expect(report.passed).toBe(false);
    expect(report.uncitedSentences.length).toBeGreaterThan(0);
  });
});
