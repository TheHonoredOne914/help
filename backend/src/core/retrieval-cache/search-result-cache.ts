import type { ResearchMode } from "../config/research-mode.js";
import type { RawSearchResult } from "../retrieval/search-executor.js";
import { searchResultCacheKey } from "./retrieval-cache-key.js";
import { diagnosticFor, emitRetrievalDiagnostic } from "./retrieval-cache-diagnostics.js";
import { freshnessForUrl, retrievalSchemaVersion, ttlForFreshness } from "./retrieval-cache-policy.js";
import type { RetrievalCacheEmitter } from "./types.js";
import { retrievalCacheStore } from "./retrieval-cache-store.js";

export interface SearchCacheInput {
  provider: string;
  query: string;
  mode?: ResearchMode;
  topicType?: string;
  bucket?: string;
  maxResults?: number;
  emit?: RetrievalCacheEmitter;
}

export function getSearchResults(input: SearchCacheInput): RawSearchResult[] | null {
  if (!retrievalCacheStore.enabled()) return null;
  const key = buildSearchKey(input);
  const entry = retrievalCacheStore.get<RawSearchResult[]>("search", key);
  if (!entry) {
    emitRetrievalDiagnostic(input.emit, diagnosticFor("search_result", "miss", key, { provider: input.provider }));
    return null;
  }
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  emitRetrievalDiagnostic(input.emit, diagnosticFor("search_result", "hit", key, { provider: input.provider, ageMs }));
  return entry.value;
}

export function writeSearchResults(input: SearchCacheInput, results: RawSearchResult[]): void {
  if (!retrievalCacheStore.enabled()) return;
  if (results.length === 0) return;
  const key = buildSearchKey(input);
  const freshness = freshestForResults(results);
  const ttlMs = ttlForFreshness(freshness);
  const entry = retrievalCacheStore.set("search", key, results, { ttlMs, freshness });
  if (entry) emitRetrievalDiagnostic(input.emit, diagnosticFor("search_result", "write", key, { provider: input.provider, ttlMs }));
}

export async function withSearchCache(input: SearchCacheInput, run: () => Promise<RawSearchResult[]>): Promise<RawSearchResult[]> {
  const cached = getSearchResults(input);
  if (cached) return cached;
  const fresh = await run();
  writeSearchResults(input, fresh);
  return fresh;
}

function buildSearchKey(input: SearchCacheInput): string {
  return searchResultCacheKey({
    schemaVersion: retrievalSchemaVersion(),
    provider: input.provider,
    query: input.query,
    mode: input.mode,
    topicType: input.topicType,
    bucket: input.bucket,
    maxResults: input.maxResults,
  });
}

function freshestForResults(results: RawSearchResult[]) {
  const values = results.map((result) => freshnessForUrl(result.url ?? ""));
  if (values.includes("fresh")) return "fresh";
  if (values.includes("semi_static")) return "semi_static";
  return "static";
}
