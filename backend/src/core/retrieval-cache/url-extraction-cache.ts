import type { EnrichedSource } from "../retrieval/enrichment/types.js";
import { canonicalizeUrl, urlExtractionCacheKey } from "./retrieval-cache-key.js";
import { diagnosticFor, emitRetrievalDiagnostic } from "./retrieval-cache-diagnostics.js";
import { EXTRACTION_CHAIN_VERSION, extractionContentHash, freshnessForExtractionUrl, retrievalSchemaVersion, shouldWriteNegativeExtraction, ttlForFreshness, validateEnrichedSourceCacheHit } from "./retrieval-cache-policy.js";
import { retrievalCacheStore } from "./retrieval-cache-store.js";
import type { RetrievalCacheEmitter } from "./types.js";

export const SNIPPET_FALLBACK_TTL_MS = 15 * 60 * 1000;

export interface ExtractionCacheInput {
  url: string;
  provider: string;
  emit?: RetrievalCacheEmitter;
  allowNegativeHit?: boolean;
  /** Defaults true: negatives are written only after the full extraction chain failed. */
  fullChainFailed?: boolean;
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
    emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "negative_hit", key, {
      provider: input.provider,
      url: input.url,
      ageMs,
      rejectionReason: entry.value.failureReason,
      negativeReason: entry.value.failureReason,
    }));
    return entry.value;
  }
  let value = validateEnrichedSourceCacheHit(entry.value);
  if (value !== entry.value) {
    retrievalCacheStore.set("enrichment", key, value, {
      ttlMs: Math.max(1000, new Date(entry.expiresAt).getTime() - Date.now()),
      sourceHash: entry.sourceHash,
    });
  }
  value = restoreSnippetEligibility(value);
  emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "hit", key, { provider: input.provider, url: input.url, ageMs, extractionQuality: value.extractionQuality }));
  return value;
}

export function writeCachedExtraction(input: ExtractionCacheInput, value: EnrichedSource): void {
  if (!retrievalCacheStore.enabled()) return;
  const key = buildExtractionKey(input);
  const textHash = extractionContentHash(value.fullText ?? value.snippet ?? "");
  const freshness = freshnessForExtractionUrl(value.url);
  const ttlMs = value.extractionMethod === "snippet_fallback" ? SNIPPET_FALLBACK_TTL_MS : ttlForFreshness(freshness);
  // Keep limitedSource, but preserve computeCitationEligibility — forcing ineligible
  // on write poisoned cache hits and under-counted weak snippets across runs.
  const safeValue = value.extractionMethod === "snippet_fallback"
    ? { ...value, limitedSource: true }
    : { ...value, extractionStatus: value.extractionStatus ?? (value.fullText ? "success" as const : "partial" as const) };
  const entry = retrievalCacheStore.set("enrichment", key, safeValue, { ttlMs, freshness, sourceHash: textHash });
  if (entry) emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "write", key, { provider: input.provider, url: value.url, ttlMs, contentHash: textHash, extractionQuality: safeValue.extractionQuality }));
}

/** Repair legacy cache entries that wiped weak snippet eligibility on write. */
function restoreSnippetEligibility(value: EnrichedSource): EnrichedSource {
  if (value.extractionMethod !== "snippet_fallback") return value;
  if (value.citationEligible) return { ...value, limitedSource: true };
  const card = value.enrichmentCard;
  if (card?.citationEligible) {
    const strength = card.citationStrength && card.citationStrength !== "ineligible"
      ? card.citationStrength
      : "weak";
    return {
      ...value,
      limitedSource: true,
      citationEligible: true,
      citationStrength: strength,
    };
  }
  return { ...value, limitedSource: true };
}

export function writeNegativeExtraction(input: ExtractionCacheInput, failure: { status?: string; error?: string }): boolean {
  if (!retrievalCacheStore.enabled()) return false;
  const policy = shouldWriteNegativeExtraction({
    status: failure.status,
    error: failure.error,
    provider: input.provider,
    fullChainFailed: input.fullChainFailed !== false,
  });
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
  if (entry) {
    emitRetrievalDiagnostic(input.emit, diagnosticFor("url_extraction", "write", key, {
      provider: input.provider,
      url: input.url,
      ttlMs: policy.ttlMs,
      rejectionReason: policy.reason,
      negativeReason: policy.reason,
    }));
  }
  return Boolean(entry);
}

function buildExtractionKey(input: ExtractionCacheInput): string {
  return urlExtractionCacheKey({
    schemaVersion: retrievalSchemaVersion(),
    url: input.url,
    extractorSetVersion: EXTRACTION_CHAIN_VERSION,
  });
}

function isNegative(value: EnrichedSource | NegativeExtractionEntry): value is NegativeExtractionEntry {
  return (value as NegativeExtractionEntry).negative === true;
}
