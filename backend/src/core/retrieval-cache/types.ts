import type { ResearchMode } from "../config/research-mode.js";
import type { CacheFreshness, CacheNamespace } from "../../services/cache-manager.js";

export type RetrievalCacheLayer =
  | "search_result"
  | "url_extraction"
  | "academic_metadata"
  | "normalized_source"
  | "evidence_ready"
  | "provider_health";

export type RetrievalCacheStatus =
  | "hit"
  | "miss"
  | "negative_hit"
  | "write"
  | "invalidate"
  | "stale_skipped"
  | "schema_mismatch";

export interface RetrievalCacheDiagnostic {
  layer: RetrievalCacheLayer;
  provider?: string;
  status: RetrievalCacheStatus;
  key: string;
  ttlMs?: number;
  ageMs?: number;
  rejectionReason?: string;
  url?: string;
  extractionQuality?: "full" | "partial" | "snippet_fallback" | "failed" | "high" | "medium" | "low";
  contentHash?: string;
  timestamp: number;
}

export interface RetrievalCacheSummary {
  layer: RetrievalCacheLayer;
  hits: number;
  misses: number;
  negativeHits: number;
  writes: number;
  invalidations: number;
  staleSkips: number;
}

export interface RetrievalCacheValue<T> {
  key: string;
  value: T;
  layer: RetrievalCacheLayer;
  schemaVersion: number;
  createdAt: number;
  expiresAt: number;
  sourceHash?: string;
  mode?: ResearchMode;
  freshness?: CacheFreshness;
  negative?: boolean;
  rejectionReason?: string;
  diagnostic?: RetrievalCacheDiagnostic;
}

export interface RetrievalCacheLayerConfig {
  namespace: CacheNamespace;
  layer: RetrievalCacheLayer;
}

export type RetrievalCacheEmitter = (event: { type: string; data?: Record<string, unknown> }) => void;
