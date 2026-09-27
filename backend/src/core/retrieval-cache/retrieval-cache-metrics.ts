import { logger } from "../../lib/logger.js";
import type { RetrievalCacheLayer, RetrievalCacheStatus, RetrievalCacheSummary } from "./types.js";

export class RetrievalCacheMetrics {
  private readonly counters = new Map<RetrievalCacheLayer, RetrievalCacheSummary>();
  private readonly negativeReasons = new Map<string, number>();
  private schemaMismatchCount = 0;
  private schemaMismatchWarned = false;
  private refreshNeededCount = 0;

  record(layer: RetrievalCacheLayer, status: RetrievalCacheStatus, negativeReason?: string): void {
    if (status === "schema_mismatch") {
      this.recordSchemaMismatch(layer);
      return;
    }
    const summary = this.counters.get(layer) ?? { layer, hits: 0, misses: 0, negativeHits: 0, writes: 0, invalidations: 0, staleSkips: 0, schemaMismatches: 0 };
    if (status === "hit") summary.hits += 1;
    if (status === "miss") summary.misses += 1;
    if (status === "negative_hit") summary.negativeHits += 1;
    if (status === "write") summary.writes += 1;
    if (status === "invalidate") summary.invalidations += 1;
    if (status === "stale_skipped") summary.staleSkips += 1;
    this.counters.set(layer, summary);
    if (negativeReason && (status === "write" || status === "negative_hit")) {
      this.negativeReasons.set(negativeReason, (this.negativeReasons.get(negativeReason) ?? 0) + 1);
    }
  }

  /** Stale-while-revalidate: served semi_static search hit; refresh optional. */
  recordRefreshNeeded(layer: RetrievalCacheLayer = "search_result"): void {
    this.refreshNeededCount += 1;
    this.record(layer, "hit");
  }

  refreshNeeded(): number {
    return this.refreshNeededCount;
  }

  recordSchemaMismatch(layer: RetrievalCacheLayer = "url_extraction"): void {
    this.schemaMismatchCount += 1;
    const summary = this.counters.get(layer) ?? { layer, hits: 0, misses: 0, negativeHits: 0, writes: 0, invalidations: 0, staleSkips: 0, schemaMismatches: 0 };
    summary.schemaMismatches = (summary.schemaMismatches ?? 0) + 1;
    this.counters.set(layer, summary);
    if (!this.schemaMismatchWarned) {
      this.schemaMismatchWarned = true;
      logger.warn({ layer, schemaMismatchCount: this.schemaMismatchCount }, "retrieval_cache_schema_mismatch");
    }
  }

  negativeReasonCounts(): Record<string, number> {
    return Object.fromEntries(this.negativeReasons.entries());
  }

  schemaMismatches(): number {
    return this.schemaMismatchCount;
  }

  snapshot(): RetrievalCacheSummary[] {
    return [...this.counters.values()].map((summary) => ({ ...summary }));
  }

  reset(): void {
    this.counters.clear();
    this.negativeReasons.clear();
    this.schemaMismatchCount = 0;
    this.schemaMismatchWarned = false;
    this.refreshNeededCount = 0;
  }
}
