import { describe, it } from "node:test";
import assert from "node:assert";
import { selectCitationsForSection } from "../../../src/core/citations/injection/deterministic-citation-injector.js";
import type { EvidenceRegistryCore } from "../../../src/core/evidence/evidence-registry.js";

describe("deterministic-citation-injector", () => {
  it("selects citations based on section buckets", () => {
    const mockRegistry = {
      getSource: (id: number) => {
        if (id === 1) return { id: 1, bucketIds: ["legal_holdings"], authorityScore: 90 };
        if (id === 2) return { id: 2, bucketIds: ["electoral_integrity"], authorityScore: 80 };
        if (id === 3) return { id: 3, bucketIds: ["legal_holdings"], authorityScore: 70 };
        return null;
      }
    } as unknown as EvidenceRegistryCore;

    const selected = selectCitationsForSection("We examine the legal holdings", [1, 2, 3], mockRegistry, 2);
    assert.deepStrictEqual(selected, [1, 3]); // Matches bucket and sorts by authority
  });

  it("uses deterministic fallback when no buckets match", () => {
    const mockRegistry = {
      getSource: (id: number) => {
        return { id, bucketIds: ["unknown_bucket"], authorityScore: 50 };
      }
    } as unknown as EvidenceRegistryCore;

    const sourceIds = [1, 2, 3, 4, 5];
    const firstFallback = selectCitationsForSection("Treasury Bench", sourceIds, mockRegistry, 2);
    const secondFallback = selectCitationsForSection("Opposition Bench", sourceIds, mockRegistry, 2);

    assert.notDeepStrictEqual(firstFallback, secondFallback); // Fallback is deterministic but pseudo-randomized by section
    
    const firstFallbackAgain = selectCitationsForSection("Treasury Bench", sourceIds, mockRegistry, 2);
    assert.deepStrictEqual(firstFallbackAgain, firstFallback); // Deterministic
  });
});
