import { describe, it, expect, vi } from "vitest";
import { runPostRepairValidation } from "../../../src/core/citations/repair/post-repair-validator.js";

describe("Post Repair Validator", () => {
  it("returns passing report if no issues found", () => {
    // Basic mock registry
    const registry = {
      isValidSourceId: vi.fn().mockReturnValue(true),
      getSource: vi.fn().mockReturnValue({ id: 1, url: "http://url", citationEligible: true }),
      getCitationEligibleCount: vi.fn().mockReturnValue(1),
      getSourcesByClass: vi.fn().mockReturnValue([]),
      sources: [],
    };

    const result = runPostRepairValidation("Valid text", registry as any, { requiredSourceBuckets: [] } as any);
    expect(result.passed).toBe(true);
  });
});
