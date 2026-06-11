import { redactSecretsDeep } from "../security/secret-redaction.js";
import { canonicalizeUrl, shortHash } from "./retrieval-cache-key.js";
import type { RetrievalCacheDiagnostic, RetrievalCacheEmitter, RetrievalCacheLayer, RetrievalCacheStatus } from "./types.js";

const EVENT_BY_STATUS: Record<RetrievalCacheStatus, string> = {
  hit: "retrieval_cache_hit",
  miss: "retrieval_cache_miss",
  negative_hit: "retrieval_cache_negative_hit",
  write: "retrieval_cache_write",
  invalidate: "retrieval_cache_invalidate",
  stale_skipped: "retrieval_cache_stale_skipped",
  schema_mismatch: "retrieval_cache_schema_mismatch",
};

export function makeRetrievalDiagnostic(input: Omit<RetrievalCacheDiagnostic, "key" | "timestamp"> & { key: string }): RetrievalCacheDiagnostic {
  return redactSecretsDeep({
    ...input,
    key: shortHash(input.key),
    url: input.url ? canonicalizeUrl(input.url) : undefined,
    timestamp: Date.now(),
  }) as RetrievalCacheDiagnostic;
}

export function emitRetrievalDiagnostic(emit: RetrievalCacheEmitter | undefined, diagnostic: RetrievalCacheDiagnostic): void {
  if (!emit) return;
  emit({ type: EVENT_BY_STATUS[diagnostic.status], data: diagnostic as unknown as Record<string, unknown> });
}

export function emitProviderCooldown(emit: RetrievalCacheEmitter | undefined, data: { provider: string; stage?: string; cooldownUntil?: string; active?: boolean }): void {
  if (!emit) return;
  emit({ type: data.active ? "provider_cooldown_active" : "provider_cooldown_extended", data: redactSecretsDeep(data) as Record<string, unknown> });
}

export function diagnosticFor(layer: RetrievalCacheLayer, status: RetrievalCacheStatus, key: string, data: Partial<RetrievalCacheDiagnostic> = {}): RetrievalCacheDiagnostic {
  return makeRetrievalDiagnostic({ ...data, layer, status, key });
}
