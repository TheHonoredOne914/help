import { describe, it, expect } from "vitest";
import { repairContradictions } from "../../../src/core/citations/repair/contradiction-repair.js";
import type { ClaimGraph } from "../../../src/core/evidence/claim-graph/types.js";

describe("Contradiction Repair", () => {
  it("adds qualifiers to unacknowledged contradictions", () => {
    const text = "Fact A is true [Source 1](url1). Fact B is true [Source 2](url2).";
    
    const graph: ClaimGraph = {
      claims: [],
      contradictions: [
        {
          id: "c1",
          sourceIds: [1, 2],
          description: "Source 1 and 2 disagree.",
          severity: "high"
        }
      ]
    };

    const result = repairContradictions(text, graph, {} as any);
    expect(result.changed).toBe(true);
    expect(result.text).toContain("this conflicts with other cited evidence");
  });

  it("skips already acknowledged contradictions", () => {
    const text = "Fact A is true [Source 1](url1), but this contradicts Source 2 [Source 2](url2).";
    
    const graph: ClaimGraph = {
      claims: [],
      contradictions: [
        {
          id: "c1",
          sourceIds: [1, 2],
          description: "Source 1 and 2 disagree.",
          severity: "high"
        }
      ]
    };

    const result = repairContradictions(text, graph, {} as any);
    expect(result.changed).toBe(false);
  });
});
