import type { CorePipelineEventSummary } from "@/hooks/use-pipeline-state";

export type RetrievalCacheLayer =
  | "search_result"
  | "url_extraction"
  | "academic_metadata"
  | "normalized_source"
  | "evidence_ready"
  | "provider_health";

export interface RetrievalCacheSummary {
  layer: RetrievalCacheLayer;
  hits: number;
  misses: number;
  negativeHits: number;
  writes: number;
  invalidations: number;
  staleSkips: number;
}

export interface RetrievalCacheStats {
  summaries: RetrievalCacheSummary[];
  cooldowns: string[];
  warnings: string[];
  totalHits: number;
  totalMisses: number;
  totalNegativeHits: number;
}

const DEFAULT_LAYERS: RetrievalCacheLayer[] = ["search_result", "url_extraction", "academic_metadata", "normalized_source", "evidence_ready", "provider_health"];

export function collectRetrievalCacheStats(events: CorePipelineEventSummary[]): RetrievalCacheStats {
  const summaries = new Map<RetrievalCacheLayer, RetrievalCacheSummary>();
  const cooldowns = new Set<string>();
  const warnings = new Set<string>();

  for (const layer of DEFAULT_LAYERS) {
    summaries.set(layer, { layer, hits: 0, misses: 0, negativeHits: 0, writes: 0, invalidations: 0, staleSkips: 0 });
  }

  for (const event of events) {
    const data = event.data ?? {};
    if (event.type === "provider_cooldown_active" || event.type === "provider_cooldown_extended") {
      cooldowns.add(formatProvider(data.provider, data.cooldownUntil));
    }
    if (event.type === "retrieval_cache_stale_skipped" || event.type === "retrieval_cache_schema_mismatch") {
      warnings.add(event.type.replace(/_/g, " "));
    }

    if (!event.type.startsWith("retrieval_cache_") && event.type !== "extraction_negative_cache_hit" && event.type !== "academic_metadata_cache_hit") continue;
    const layer = normalizeLayer(data.layer, event.type);
    const summary = summaries.get(layer) ?? { layer, hits: 0, misses: 0, negativeHits: 0, writes: 0, invalidations: 0, staleSkips: 0 };
    if (event.type === "retrieval_cache_hit" || event.type === "academic_metadata_cache_hit") summary.hits += 1;
    if (event.type === "retrieval_cache_miss") summary.misses += 1;
    if (event.type === "retrieval_cache_negative_hit" || event.type === "extraction_negative_cache_hit") summary.negativeHits += 1;
    if (event.type === "retrieval_cache_write") summary.writes += 1;
    if (event.type === "retrieval_cache_invalidate") summary.invalidations += 1;
    if (event.type === "retrieval_cache_stale_skipped") summary.staleSkips += 1;
    summaries.set(layer, summary);
  }

  const list = [...summaries.values()].filter((summary) => summary.hits || summary.misses || summary.negativeHits || summary.writes || summary.invalidations || summary.staleSkips);
  return {
    summaries: list,
    cooldowns: [...cooldowns],
    warnings: [...warnings],
    totalHits: list.reduce((sum, item) => sum + item.hits, 0),
    totalMisses: list.reduce((sum, item) => sum + item.misses, 0),
    totalNegativeHits: list.reduce((sum, item) => sum + item.negativeHits, 0),
  };
}

function normalizeLayer(value: unknown, eventType: string): RetrievalCacheLayer {
  if (typeof value === "string" && DEFAULT_LAYERS.includes(value as RetrievalCacheLayer)) return value as RetrievalCacheLayer;
  if (eventType === "extraction_negative_cache_hit") return "url_extraction";
  if (eventType === "academic_metadata_cache_hit") return "academic_metadata";
  return "search_result";
}

function formatProvider(provider: unknown, cooldownUntil: unknown): string {
  const name = typeof provider === "string" ? provider : "provider";
  if (typeof cooldownUntil !== "string") return name;
  return `${name} until ${cooldownUntil.slice(11, 16)}`;
}
