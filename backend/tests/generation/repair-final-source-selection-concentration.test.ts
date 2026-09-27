import test from "node:test";
import assert from "node:assert/strict";
import { repairFinalSourceSelection } from "../../src/core/generation/core-answer-generator.js";

const BUCKETS = [
  "government_official",
  "parliamentary_records",
  "court_legal",
  "indian_major_media",
  "policy_research",
] as const;

function makeRegistry(sourceCount: number, dominantShare = 0.8) {
  const dominantCount = Math.floor(sourceCount * dominantShare);
  const sources = Array.from({ length: sourceCount }, (_, index) => {
    const id = index + 1;
    const bucket = index < dominantCount
      ? BUCKETS[0]
      : BUCKETS[1 + ((index - dominantCount) % (BUCKETS.length - 1))];
    return {
      id,
      citationEligible: true,
      extractionQuality: "full" as const,
      citationStrength: "strong" as const,
      limitedSource: false,
      authorityScore: 90 - (index % 5),
      bucketIds: [bucket],
    };
  });
  return {
    getSource: (id: number) => sources.find((source) => source.id === id),
    getCitationEligibleSources: () => sources,
  };
}

test("repairFinalSourceSelection keeps dominant-bucket share under concentration cap", () => {
  // Diverse enough registry: selection can meet the 40-cite floor without exceeding 0.42 share.
  const registry = makeRegistry(80, 0.4) as any;
  const selected = repairFinalSourceSelection(registry, Array.from({ length: 40 }, (_, i) => i + 1), 40);

  assert.equal(selected.length, 40);
  const bucketCounts = new Map<string, number>();
  for (const id of selected) {
    const source = registry.getSource(id);
    for (const bucket of source.bucketIds) {
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    }
  }
  const largest = Math.max(...bucketCounts.values());
  const concentration = largest / selected.length;
  assert.ok(
    concentration <= 0.42 + 1e-9,
    `expected concentration <= 0.42, got ${concentration.toFixed(3)} (largest=${largest})`,
  );
  assert.ok(bucketCounts.size >= 3, "should still spread across multiple buckets");
});

test("repairFinalSourceSelection caps primary bucket even when sources carry extra tags", () => {
  const sources = Array.from({ length: 100 }, (_, index) => {
    const id = index + 1;
    const primary = BUCKETS[index % BUCKETS.length];
    return {
      id,
      citationEligible: true,
      extractionQuality: "full" as const,
      citationStrength: "medium" as const,
      limitedSource: true,
      authorityScore: 70,
      // Secondary tags used to inflate every membership and defeat the per-bucket cap.
      bucketIds: [primary, "electoral_integrity", "policy_research"],
    };
  });
  const registry = {
    getSource: (id: number) => sources.find((source) => source.id === id),
    getCitationEligibleSources: () => sources,
  } as any;
  const selected = repairFinalSourceSelection(registry, sources.map((s) => s.id), 40);
  assert.equal(selected.length, 40);
  const primaryCounts = new Map<string, number>();
  for (const id of selected) {
    const primary = registry.getSource(id).bucketIds[0];
    primaryCounts.set(primary, (primaryCounts.get(primary) ?? 0) + 1);
  }
  const largest = Math.max(...primaryCounts.values());
  assert.ok(
    largest / selected.length <= 0.42 + 1e-9,
    `primary concentration ${largest}/40 exceeds 0.42`,
  );
});

test("repairFinalSourceSelection prefers limited full text over snippets", () => {
  const sources = [
    ...Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      citationEligible: true,
      extractionQuality: "snippet" as const,
      citationStrength: "weak" as const,
      limitedSource: true,
      authorityScore: 80,
      bucketIds: [BUCKETS[index % BUCKETS.length]],
    })),
    ...Array.from({ length: 25 }, (_, index) => ({
      id: index + 21,
      citationEligible: true,
      extractionQuality: "full" as const,
      citationStrength: "weak" as const,
      limitedSource: true,
      authorityScore: 60,
      bucketIds: [BUCKETS[index % BUCKETS.length]],
    })),
  ];
  const registry = {
    getSource: (id: number) => sources.find((source) => source.id === id),
    getCitationEligibleSources: () => sources,
  } as any;
  const selected = repairFinalSourceSelection(registry, sources.map((s) => s.id), 20);
  assert.equal(selected.length, 20);
  const snippetCount = selected.filter((id) => registry.getSource(id).extractionQuality === "snippet").length;
  assert.equal(snippetCount, 0, "should fill from limited full texts before snippets");
});
