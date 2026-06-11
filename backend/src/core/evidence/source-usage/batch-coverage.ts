import type { SourceBucketId } from "../../retrieval/source-buckets.js";

export function balancedSources<T extends { id: number; bucketIds: SourceBucketId[]; authorityScore: number }>(sources: T[], limit: number): T[] {
  const sorted = [...sources].sort((a, b) => b.authorityScore - a.authorityScore);
  const selected: T[] = [];
  const bucketCounts = new Map<string, number>();
  for (const source of sorted) {
    const leastCovered = source.bucketIds.some((bucketId) => (bucketCounts.get(bucketId) ?? 0) < 3);
    if (!leastCovered && selected.length >= 30) continue;
    selected.push(source);
    for (const bucketId of source.bucketIds) bucketCounts.set(bucketId, (bucketCounts.get(bucketId) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    for (const source of sorted) {
      if (selected.some((item) => item.id === source.id)) continue;
      selected.push(source);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}
