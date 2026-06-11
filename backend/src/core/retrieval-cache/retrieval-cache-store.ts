import type { CacheEntry, CacheFreshness, CacheManager, CacheNamespace } from "../../services/cache-manager.js";
import { globalResearchCache } from "../../services/cache-manager.js";
import { config } from "../../config.js";
import { defaultTtlMs, retrievalCacheEnabled } from "./retrieval-cache-policy.js";
import { logger } from "../../lib/logger.js";

export class RetrievalCacheStore {
  constructor(private readonly cache: CacheManager = globalResearchCache) {}

  enabled(): boolean {
    return retrievalCacheEnabled();
  }

  get<T>(namespace: CacheNamespace, key: string, options: { allowPartialReuse?: boolean } = {}): CacheEntry<T> | null {
    if (!this.enabled()) return null;
    return this.cache.getEntry<T>(namespace, key, options);
  }

  set<T>(namespace: CacheNamespace, key: string, value: T, options: { ttlMs?: number; freshness?: CacheFreshness; sourceHash?: string; agendaFingerprint?: string } = {}): CacheEntry<T> | null {
    if (!this.enabled()) return null;
    let size = 0;
    try {
      size = Buffer.byteLength(JSON.stringify(value), "utf8");
    } catch (error) {
      logger.warn({ namespace, error: error instanceof Error ? error.message : String(error) }, "Retrieval cache entry skipped because it could not be serialized");
      return null;
    }
    if (size > config.RETRIEVAL_CACHE_MAX_ENTRY_BYTES) {
      logger.warn({ namespace, size, maxEntryBytes: config.RETRIEVAL_CACHE_MAX_ENTRY_BYTES }, "Retrieval cache entry skipped because it exceeds max size");
      return null;
    }
    return this.cache.set(namespace, key, value, { ttlMs: options.ttlMs ?? defaultTtlMs(), freshness: options.freshness, sourceHash: options.sourceHash, agendaFingerprint: options.agendaFingerprint });
  }

  delete(namespace: CacheNamespace, key: string): boolean {
    if (!this.enabled()) return false;
    return this.cache.delete(namespace, key);
  }

  clearNamespace(namespace: CacheNamespace): number {
    return this.cache.clearNamespace(namespace);
  }
}

export function createRetrievalCacheStore(cache: CacheManager = globalResearchCache): RetrievalCacheStore {
  return new RetrievalCacheStore(cache);
}

export const retrievalCacheStore = new RetrievalCacheStore();
