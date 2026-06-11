import type { RetrievalCacheLayer, RetrievalCacheStatus, RetrievalCacheSummary } from "./types.js";

export class RetrievalCacheMetrics {
  private readonly counters = new Map<RetrievalCacheLayer, RetrievalCacheSummary>();

  record(layer: RetrievalCacheLayer, status: RetrievalCacheStatus): void {
    const summary = this.counters.get(layer) ?? { layer, hits: 0, misses: 0, negativeHits: 0, writes: 0, invalidations: 0, staleSkips: 0 };
    if (status === "hit") summary.hits += 1;
    if (status === "miss") summary.misses += 1;
    if (status === "negative_hit") summary.negativeHits += 1;
    if (status === "write") summary.writes += 1;
    if (status === "invalidate") summary.invalidations += 1;
    if (status === "stale_skipped") summary.staleSkips += 1;
    this.counters.set(layer, summary);
  }

  snapshot(): RetrievalCacheSummary[] {
    return [...this.counters.values()].map((summary) => ({ ...summary }));
  }

  reset(): void {
    this.counters.clear();
  }
}
