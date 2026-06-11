import type { EnrichedSource } from "../retrieval/enrichment/types.js";
import { canonicalizeUrl, urlExtractionCacheKey } from "./retrieval-cache-key.js";
import { diagnosticFor, emitRetrievalDiagnostic } from "./retrieval-cache-diagnostics.js";
import { extractionContentHash, freshnessForUrl, retrievalSchemaVersion, shouldWriteNegativeExtraction, ttlForFreshness, validateEnrichedSourceCacheHit } from "./retrieval-cache-policy.js";
import { retrievalCacheStore } from "./retrieval-cache-store.js";
import type { RetrievalCacheEmitter } from "./types.js";

export const SNIPPET_FALLBACK_TTL_MS = 15 * 60 * 1000;

export interface ExtractionCacheInput {
  url: string;
  provider: string;
  emit?: RetrievalCacheEmitter;
  allowNegativeHit?: boolean;
}

export interface NegativeExtractionEntry {
  negative: true;
  canonicalUrl: string;
  provider: string;
  failureReason: string;
  extractionStatus: "failed";
}

export function getCachedExtraction(input: ExtractionCacheInput): EnrichedSource | NegativeExtractionEntry | null {
  if (!retrievalCacheStore.enabled()) return null;
  const key = buildExtractionKey(input);
  const entry = retrievalCacheStore.get<EnrichedSource | NegativeExtractionEntry>("enrichment", key, { allowPartialReuse: true });
  if (!entry) {
    emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "miss", key, { provider: input.provider, url: input.url }));
    return null;
  }
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  if (isNegative(entry.value)) {
    if (input.allowNegativeHit === false) return null;
    emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "negative_hit", key, { provider: input.provider, url: input.url, ageMs, rejectionReason: entry.value.failureReason }));
    return entry.value;
  }
  const value = validateEnrichedSourceCacheHit(entry.value);
  if (value !== entry.value) {
    retrievalCacheStore.set("enrichment", key, value, {
      ttlMs: Math.max(1000, new Date(entry.expiresAt).getTime() - Date.now()),
      sourceHash: entry.sourceHash,
    });
  }
  emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "hit", key, { provider: input.provider, url: input.url, ageMs, extractionQuality: value.extractionQuality }));
  return value;
}

export function writeCachedExtraction(input: ExtractionCacheInput, value: EnrichedSource): void {
  if (!retrievalCacheStore.enabled()) return;
  const key = buildExtractionKey(input);
  const textHash = extractionContentHash(value.fullText ?? value.snippet ?? "");
  const freshness = freshnessForUrl(value.url);
  const ttlMs = value.extractionMethod === "snippet_fallback" ? SNIPPET_FALLBACK_TTL_MS : ttlForFreshness(freshness);
  const safeValue = value.extractionMethod === "snippet_fallback"
    ? { ...value, limitedSource: true, citationEligible: false, citationStrength: "ineligible" as const }
    : { ...value, extractionStatus: value.extractionStatus ?? (value.fullText ? "success" as const : "partial" as const) };
  const entry = retrievalCacheStore.set("enrichment", key, safeValue, { ttlMs, freshness, sourceHash: textHash });
  if (entry) emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "write", key, { provider: input.provider, url: value.url, ttlMs, contentHash: textHash, extractionQuality: safeValue.extractionQuality }));
}

export function writeNegativeExtraction(input: ExtractionCacheInput, failure: { status?: string; error?: string }): boolean {
  if (!retrievalCacheStore.enabled()) return false;
  const policy = shouldWriteNegativeExtraction({ status: failure.status, error: failure.error, provider: input.provider });
  if (!policy.write) return false;
  const key = buildExtractionKey(input);
  const value: NegativeExtractionEntry = {
    negative: true,
    canonicalUrl: canonicalizeUrl(input.url),
    provider: input.provider,
    failureReason: policy.reason,
    extractionStatus: "failed",
  };
  const entry = retrievalCacheStore.set("enrichment", key, value, { ttlMs: policy.ttlMs });
  if (entry) emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "write", key, { provider: input.provider, url: input.url, ttlMs: policy.ttlMs, rejectionReason: policy.reason }));
  return Boolean(entry);
}

function buildExtractionKey(input: ExtractionCacheInput): string {
  return urlExtractionCacheKey({
    schemaVersion: retrievalSchemaVersion(),
    url: input.url,
  });
}

function isNegative(value: EnrichedSource | NegativeExtractionEntry): value is NegativeExtractionEntry {
  return (value as NegativeExtractionEntry).negative === true;
}
