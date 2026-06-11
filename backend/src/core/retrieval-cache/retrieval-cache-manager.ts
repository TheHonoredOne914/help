import type { RawSearchResult } from "../retrieval/search-executor.js";
import type { EnrichedSource } from "../retrieval/enrichment/types.js";
import type { EvidenceSource } from "../evidence/evidence-registry.js";
import type { EvidenceCard } from "../evidence/evidence-pack/types.js";
import type { ExtractionCooldownState } from "../providers/limits/extraction-cooldown.js";
import { RetrievalCacheMetrics } from "./retrieval-cache-metrics.js";
import { getSearchResults, writeSearchResults, type SearchCacheInput } from "./search-result-cache.js";
import { getCachedExtraction, writeCachedExtraction, writeNegativeExtraction, type ExtractionCacheInput, type NegativeExtractionEntry } from "./url-extraction-cache.js";
import { hydrateExtractionCooldown, persistExtractionCooldown } from "./provider-health-cache.js";
import { getNormalizedSource, writeNormalizedSource } from "./normalized-source-cache.js";
import { getEvidenceReadyCard, writeEvidenceReadyCard } from "./evidence-ready-cache.js";
import { retrievalCacheEnabled } from "./retrieval-cache-policy.js";

export class RetrievalCacheManager {
  readonly metrics = new RetrievalCacheMetrics();

  enabled(): boolean {
    return retrievalCacheEnabled();
  }

  getSearchResults(input: SearchCacheInput): RawSearchResult[] | null {
    const value = getSearchResults(input);
    this.metrics.record("search_result", value ? "hit" : "miss");
    return value;
  }

  writeSearchResults(input: SearchCacheInput, results: RawSearchResult[]): void {
    writeSearchResults(input, results);
    if (results.length) this.metrics.record("search_result", "write");
  }

  getExtraction(input: ExtractionCacheInput): EnrichedSource | NegativeExtractionEntry | null {
    const value = getCachedExtraction(input);
    this.metrics.record("url_extraction", value ? (isNegativeExtractionEntry(value) ? "negative_hit" : "hit") : "miss");
    return value;
  }

  writeExtraction(input: ExtractionCacheInput, value: EnrichedSource): void {
    writeCachedExtraction(input, value);
    this.metrics.record("url_extraction", "write");
  }

  writeNegativeExtraction(input: ExtractionCacheInput, failure: { status?: string; error?: string }): boolean {
    const wrote = writeNegativeExtraction(input, failure);
    if (wrote) this.metrics.record("url_extraction", "write");
    return wrote;
  }

  hydrateExtractionCooldown(state: ExtractionCooldownState, options: Parameters<typeof hydrateExtractionCooldown>[1] = {}): ExtractionCooldownState {
    return hydrateExtractionCooldown(state, options);
  }

  persistExtractionCooldown(state: ExtractionCooldownState, options: Parameters<typeof persistExtractionCooldown>[1] = {}): void {
    persistExtractionCooldown(state, options);
  }

  getNormalizedSource<T>(url: string, identifier?: string): T | null {
    return getNormalizedSource<T>(url, identifier);
  }

  writeNormalizedSource<T>(url: string, value: T, identifier?: string): void {
    writeNormalizedSource(url, value, identifier);
  }

  getEvidenceCard(source: EvidenceSource, agendaFingerprint?: string): EvidenceCard | null {
    return getEvidenceReadyCard(source, agendaFingerprint);
  }

  writeEvidenceCard(source: EvidenceSource, card: EvidenceCard, agendaFingerprint?: string): void {
    writeEvidenceReadyCard(source, card, agendaFingerprint);
  }
}

export const retrievalCacheManager = new RetrievalCacheManager();

function isNegativeExtractionEntry(value: EnrichedSource | NegativeExtractionEntry): value is NegativeExtractionEntry {
  return (value as NegativeExtractionEntry).negative === true;
}
