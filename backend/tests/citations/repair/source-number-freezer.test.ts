import { describe, it, expect, vi } from "vitest";
import { freezeSourceNumbers, validateFrozenSourceNumbers, repairSourceNumberDrift } from "../../../src/core/citations/repair/source-number-freezer.js";

describe("Source Number Freezer", () => {
  it("detects drifted and phantom sources", () => {
    const registry = {
      getCitationEligibleSources: vi.fn().mockReturnValue([
        { id: 1, url: "http://url1.com", title: "1" }
      ])
    };

    const frozen = freezeSourceNumbers(registry as any);

    const text = "Valid [Source 1](http://url1.com). Drifted [Source 1](http://wrong.com). Phantom [Source 2](http://url2.com).";
    const result = validateFrozenSourceNumbers(text, frozen);

    expect(result.valid).toBe(false);
    expect(result.driftedIds).toContain(1);
    expect(result.phantomIds).toContain(2);
  });

  it("repairs drifted URLs", () => {
    const registry = {
      getCitationEligibleSources: vi.fn().mockReturnValue([
        { id: 1, url: "http://url1.com", title: "1" }
      ])
    };

    const frozen = freezeSourceNumbers(registry as any);
    const text = "Drifted [Source 1](http://wrong.com).";
    
    const result = repairSourceNumberDrift(text, frozen);
    expect(result.changed).toBe(true);
    expect(result.text).toContain("[Source 1](http://url1.com)");
  });
});
