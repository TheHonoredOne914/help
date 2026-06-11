import { createHash } from "node:crypto";
import { config } from "../../config.js";
import type { CacheFreshness } from "../../services/cache-manager.js";
import type { EnrichedSource } from "../retrieval/enrichment/types.js";

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

export function ttlForFreshness(freshness: CacheFreshness): number {
  if (freshness === "static") return 30 * 24 * 60 * 60 * 1000;
  if (freshness === "semi_static") return defaultTtlMs();
  return freshTtlMs();
}

export function freshnessForUrl(url: string): CacheFreshness {
  const lower = url.toLowerCase();
  if (/(sci\.gov\.in|indiankanoon|prsindia|sansad|eci\.gov\.in|egazette|pib\.gov\.in)/.test(lower)) return "static";
  const year = new Date().getUTCFullYear();
  if (
    lower.includes(String(year))
    || /(news|live|latest|today|breaking)/.test(lower)
    || /(thehindu|indianexpress|scroll\.in|thewire\.in|hindustantimes|timesofindia|ndtv|deccanherald|livemint)/.test(lower)
  ) return "fresh";
  return "semi_static";
}

export function extractionContentHash(text: string | null | undefined): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return normalized ? sha256Local(normalized) : "";
}

export function validateEnrichedSourceCacheHit(cached: EnrichedSource): EnrichedSource {
  if (cached.extractionMethod === "snippet_fallback" && cached.extractionQuality !== "low") {
    throw new Error("Unsafe retrieval cache hit: snippet fallback cannot be promoted");
  }
  if (cached.extractionMethod === "snippet_fallback" && cached.limitedSource !== true) {
    return { ...cached, limitedSource: true, citationEligible: false, citationStrength: "ineligible" };
  }
  return cached;
}

export function shouldWriteNegativeExtraction(input: { status?: string; provider?: string; error?: string }): { write: boolean; ttlMs: number; reason: string } {
  const provider = input.provider?.toLowerCase();
  const error = input.error ?? "";
  if (provider === "jina" && /\b422\b/.test(error)) return { write: true, ttlMs: 60 * 60 * 1000, reason: "jina_422" };
  if (/\b404\b|not found/i.test(error)) return { write: true, ttlMs: 7 * 24 * 60 * 60 * 1000, reason: "not_found" };
  if (/\b403\b|forbidden|paywall|unauthorized/i.test(error)) return { write: true, ttlMs: 24 * 60 * 60 * 1000, reason: "forbidden" };
  if (/\b429\b|rate limit|too many requests/i.test(error)) return { write: true, ttlMs: negativeTtlMs(), reason: "rate_limited" };
  if (provider === "firecrawl" && /(timeout|504|408|5\d\d)/i.test(error)) return { write: true, ttlMs: 30 * 60 * 1000, reason: "firecrawl_timeout" };
  if (input.status === "failed" && /(timeout|network|5\d\d|408|504)/i.test(error)) return { write: true, ttlMs: negativeTtlMs(), reason: "temporary_extraction_failure" };
  return { write: false, ttlMs: 0, reason: "" };
}

function sha256Local(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
