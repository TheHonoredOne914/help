import type { CacheManager } from "../../../services/cache-manager.js";
import type { CacheTTLPolicy, EnrichedSource } from "./types.js";
import { emitEnrichmentEvent } from "./telemetry.js";
import { canonicalizeUrl, sha256Hex } from "../../retrieval-cache/retrieval-cache-key.js";
import { freshnessForUrl as sharedFreshnessForUrl } from "../../retrieval-cache/retrieval-cache-policy.js";
import { SNIPPET_FALLBACK_TTL_MS } from "../../retrieval-cache/url-extraction-cache.js";

export function enrichmentCachePolicy(
  status: EnrichedSource["extractionStatus"],
  method?: EnrichedSource["extractionMethod"],
  url?: string,
): CacheTTLPolicy {
  if (status === "failed") return { status: "failed", write: false };
  if (method === "snippet_fallback") return { status: "snippet_fallback", write: true, ttlMs: SNIPPET_FALLBACK_TTL_MS };
  if (status === "partial") return { status: "partial", write: true, freshness: freshnessForUrl(url ?? "") };
  return { status: "success", write: true, freshness: freshnessForUrl(url ?? "") };
}

export function cacheEnrichedSource(cache: CacheManager, source: EnrichedSource, query?: string): void {
  const cacheKey = enrichmentCacheKey(source.url, query);
  const status = source.extractionStatus ?? (source.fullText ? "success" : "partial");
  const policy = enrichmentCachePolicy(status, source.extractionMethod, source.url);
  const cacheValue = normalizeCachedSource(source);
  emitEnrichmentEvent("enrichment.cache_policy", { policy: policy.status, write: policy.write });
  if (!policy.write) {
    emitEnrichmentEvent("enrichment.failed_not_cached", { url_domain: source.domain });
    return;
  }
  if (policy.ttlMs !== undefined) {
    cache.set("enrichment", cacheKey, cacheValue, { ttlMs: policy.ttlMs, runTags: { status: "completed" } });
  } else {
    cache.set("enrichment", cacheKey, cacheValue, { freshness: policy.freshness, runTags: { status: "completed" } });
  }
}

function normalizeCachedSource(source: EnrichedSource): EnrichedSource {
  if (source.extractionMethod !== "snippet_fallback") return source;
  return {
    ...source,
    citationEligible: false,
    citationStrength: "ineligible",
    limitedSource: true,
    enrichmentCard: source.enrichmentCard
      ? {
          ...source.enrichmentCard,
          citationEligible: false,
          citationStrength: "ineligible",
          limitedSource: true,
        }
      : source.enrichmentCard,
  };
}

export function enrichmentCacheKey(url: string, query?: string): string {
  const normalizedUrl = canonicalizeUrl(url);
  return query ? `${normalizedUrl}::${hashQuery(query)}` : normalizedUrl;
}

function hashQuery(query: string): string {
  return sha256Hex(query.replace(/\s+/g, " ").trim().toLowerCase()).slice(0, 32);
}

export function freshnessForUrl(url: string): "fresh" | "semi_static" | "static" {
  return sharedFreshnessForUrl(url);
}
