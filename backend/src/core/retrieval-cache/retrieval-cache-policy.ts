import { createHash } from "node:crypto";
import { config } from "../../config.js";
import type { CacheFreshness } from "../../services/cache-manager.js";
import type { EnrichedSource } from "../retrieval/enrichment/types.js";

export type SearchBucketMode = "web" | "news" | "academic" | "legal" | "official" | "semantic";

export function retrievalCacheEnabled(): boolean {
  return config.RETRIEVAL_CACHE_ENABLED;
}

export function retrievalSchemaVersion(): number {
  return config.RETRIEVAL_CACHE_SCHEMA_VERSION;
}

export function defaultTtlMs(): number {
  return Math.max(1, config.RETRIEVAL_CACHE_DEFAULT_TTL_SECONDS) * 1000;
}

export function negativeTtlMs(): number {
  return Math.max(1, config.RETRIEVAL_CACHE_NEGATIVE_TTL_SECONDS) * 1000;
}

export function freshTtlMs(): number {
  return Math.max(1, config.RETRIEVAL_CACHE_FRESH_TTL_SECONDS) * 1000;
}

/** Empty search negatives: short cool-down (30–60m). */
export function emptySearchNegativeTtlMs(): number {
  return 45 * 60 * 1000;
}

export function ttlForFreshness(freshness: CacheFreshness): number {
  if (freshness === "static") return 30 * 24 * 60 * 60 * 1000;
  if (freshness === "semi_static") return Math.max(defaultTtlMs(), 7 * 24 * 60 * 60 * 1000);
  return Math.min(Math.max(freshTtlMs(), 6 * 60 * 60 * 1000), 12 * 60 * 60 * 1000);
}

const GOV_LEGAL_STATIC = /(sci\.gov\.in|indiankanoon|prsindia|sansad|eci\.gov\.in|egazette|pib\.gov\.in|legislative\.gov\.in|india\.gov\.in)/;
const NEWS_HOST = /(thehindu|indianexpress|scroll\.in|thewire\.in|hindustantimes|timesofindia|ndtv|deccanherald|livemint|reuters|bbc\.|cnn\.|nytimes|washingtonpost)/;
const LISTING_PATH = /\/(latest|live|breaking|today|category|tag|topic|topics|section|tags)(?:\/|$)/i;

/**
 * Extraction TTL by URL class.
 * News articles → semi_static (~7d). Listing/latest paths → fresh (~6h).
 * Does not treat calendar year in URL as always-fresh for article paths.
 */
export function freshnessForExtractionUrl(url: string): CacheFreshness {
  const lower = url.toLowerCase();
  if (GOV_LEGAL_STATIC.test(lower)) return "static";
  if (/\.(gov|nic)\.in/.test(lower) && /\.pdf(?:$|[?#])/.test(lower)) return "static";
  if (LISTING_PATH.test(lower)) return "fresh";
  if (NEWS_HOST.test(lower)) return "semi_static";
  if (/\/(live|breaking)(?:\/|$)/.test(lower)) return "fresh";
  return "semi_static";
}

/** Search-result TTL by bucket mode (news fresh; legal/official/index semi_static). */
export function freshnessForSearchResults(bucketMode: SearchBucketMode): CacheFreshness {
  if (bucketMode === "news") return "fresh";
  if (bucketMode === "legal" || bucketMode === "official" || bucketMode === "academic" || bucketMode === "semantic") {
    return "semi_static";
  }
  return "semi_static";
}

/** @deprecated Prefer freshnessForExtractionUrl — kept for callers that pass a URL. */
export function freshnessForUrl(url: string): CacheFreshness {
  return freshnessForExtractionUrl(url);
}

export function extractionContentHash(text: string | null | undefined): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return normalized ? sha256Local(normalized) : "";
}

export function validateEnrichedSourceCacheHit(cached: EnrichedSource): EnrichedSource {
  if (cached.extractionMethod === "snippet_fallback" && cached.extractionQuality !== "low" && cached.citationStrength === "strong") {
    throw new Error("Unsafe retrieval cache hit: snippet fallback cannot be promoted");
  }
  if (cached.extractionMethod === "snippet_fallback") {
    // Keep limited; allow weak eligibility already computed — never promote to strong.
    const strength = cached.citationStrength === "strong" || cached.citationStrength === "medium"
      ? "weak" as const
      : cached.citationStrength;
    return {
      ...cached,
      limitedSource: true,
      citationStrength: strength,
      citationEligible: strength === "weak" ? Boolean(cached.citationEligible) : false,
    };
  }
  return cached;
}

/** Bump when the extraction provider chain changes so jina_422 negatives do not poison new extractors. */
export const EXTRACTION_CHAIN_VERSION = 2;

export type NegativeExtractionDecision = {
  write: boolean;
  ttlMs: number;
  reason: string;
  /** Temporary provider failures should cool down the provider, not the URL. */
  routeToProviderHealth?: boolean;
};

/**
 * URL negatives only for durable URL problems (404/403/paywall) or full-chain jina 422.
 * Rate limits / timeouts route to provider_health instead.
 */
export function shouldWriteNegativeExtraction(input: {
  status?: string;
  provider?: string;
  error?: string;
  /** When true, jina 422 may write a URL negative (full extraction chain already failed). */
  fullChainFailed?: boolean;
}): NegativeExtractionDecision {
  const provider = input.provider?.toLowerCase();
  const error = input.error ?? "";
  if (provider === "jina" && /\b422\b/.test(error)) {
    if (input.fullChainFailed === false) return { write: false, ttlMs: 0, reason: "jina_422", routeToProviderHealth: true };
    return { write: true, ttlMs: 60 * 60 * 1000, reason: "jina_422" };
  }
  if (/\b404\b|not found/i.test(error)) return { write: true, ttlMs: 7 * 24 * 60 * 60 * 1000, reason: "not_found" };
  if (/\b403\b|forbidden|paywall|unauthorized/i.test(error)) return { write: true, ttlMs: 24 * 60 * 60 * 1000, reason: "forbidden" };
  if (/\b429\b|rate limit|too many requests/i.test(error)) {
    return { write: false, ttlMs: 0, reason: "rate_limited", routeToProviderHealth: true };
  }
  if (provider === "firecrawl" && /(timeout|504|408|5\d\d)/i.test(error)) {
    return { write: false, ttlMs: 0, reason: "firecrawl_timeout", routeToProviderHealth: true };
  }
  if (input.status === "failed" && /(timeout|network|5\d\d|408|504)/i.test(error)) {
    return { write: false, ttlMs: 0, reason: "temporary_extraction_failure", routeToProviderHealth: true };
  }
  return { write: false, ttlMs: 0, reason: "" };
}

function sha256Local(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
