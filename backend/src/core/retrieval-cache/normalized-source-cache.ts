import { normalizedSourceCacheKey } from "./retrieval-cache-key.js";
import { retrievalSchemaVersion } from "./retrieval-cache-policy.js";
import { retrievalCacheStore } from "./retrieval-cache-store.js";

export function getNormalizedSource<T>(url: string, identifier?: string): T | null {
  const key = normalizedSourceCacheKey({ schemaVersion: retrievalSchemaVersion(), url, identifier });
  return retrievalCacheStore.get<T>("source_score", key)?.value ?? null;
}

export function writeNormalizedSource<T>(url: string, value: T, identifier?: string): void {
  const key = normalizedSourceCacheKey({ schemaVersion: retrievalSchemaVersion(), url, identifier });
  retrievalCacheStore.set("source_score", key, value, { freshness: "semi_static" });
}
