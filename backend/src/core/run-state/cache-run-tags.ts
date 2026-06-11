import type { CacheEntry, CacheSetOptions } from "../../services/cache-manager.js";
import type { RunCacheTags } from "./types.js";

export function withRunCacheTags(options: CacheSetOptions = {}, tags: RunCacheTags = {}): CacheSetOptions {
  return { ...options, runTags: tags };
}

export function isCacheEntryReusable(entry: CacheEntry<unknown> | null | undefined, options: { allowPartialReuse?: boolean } = {}): boolean {
  if (!entry) return false;
  const tags = entry.runTags;
  if (!tags) return true;
  if (tags.providerError) return false;
  if (tags.status === "failed" || tags.status === "provider_error" || tags.status === "cancelled") return false;
  if ((tags.status === "partial" || tags.status === "completed_with_source_gaps" || tags.status === "degraded_fallback") && !options.allowPartialReuse) return false;
  return true;
}
