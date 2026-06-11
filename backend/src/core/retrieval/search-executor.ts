import type { SourceBucketId } from "./source-buckets.js";
import type { BucketedQueryPlan } from "./query-planner.js";
import { redactSecretString } from "../security/secret-redaction.js";
import type { CacheManager } from "../../services/cache-manager.js";
import { createSearchRuntimeMetadata, searchWithFallback } from "../search/search-provider-router.js";
import { searchModeForBucket } from "../search/search-fallback-policy.js";
import type { ExtractorProviderName, SearchOnlyProviderName } from "../search/search-provider-types.js";
import { retrievalCacheManager } from "../retrieval-cache/index.js";
import type { ResearchMode } from "../config/research-mode.js";
import { logger } from "../../lib/logger.js";
import { multiKeyFetch } from "../../lib/multi-key-fetch.js";

export class RetrievalError extends Error {
  constructor(
    message: string,
    public readonly providerFailures: string[] = [],
    public readonly partialResults: number = 0,
  ) {
    super(message);
    this.name = "RetrievalError";
  }
}

export interface RawSearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedDate: string | null;
  provider: string;
  discoveredBy?: string[];
  foundByQuery: string;
  bucketId: SourceBucketId;
  rawRank: number;
  fetchedAt: string;
  retrievedAt?: string;
  providerErrors?: string[];
}

export type SearchProviderName = SearchOnlyProviderName;

const CACHE_REPLAY_PROVIDERS: SearchProviderName[] = ["serper", "exa", "tavily", "brave"];

export interface SearchExecutionOptions {
  live?: boolean;
  allowMock?: boolean;
  providers?: SearchProviderName[];
  maxConcurrency?: number;
  timeoutMs?: number;
  maxResultsPerQuery?: number;
  useCache?: boolean;
  mode?: ResearchMode;
  topicType?: string;
  cache?: CacheManager;
  providerKeys?: Partial<Record<SearchProviderName | ExtractorProviderName, string | undefined>>;
  fetchFn?: typeof fetch;
  abortSignal?: AbortSignal;
  onProviderError?: (error: string) => void;
  onCacheEvent?: (event: string, data: Record<string, unknown>) => void;
}

interface ProviderSearchItem {
  title: string;
  url: string;
  snippet: string;
  publishedDate: string | null;
  discoveredBy?: string[];
  retrievedAt?: string;
}

export async function runSearchPlan(plan: BucketedQueryPlan, options: SearchExecutionOptions = {}): Promise<RawSearchResult[]> {
  if (options.abortSignal?.aborted) throw new RetrievalError("Retrieval aborted", [], 0);
  if (!options.live) {
    if (options.allowMock === false) {
      options.onProviderError?.("mock search disabled for this run");
      return [];
    }
    return deterministicSearch(plan, options.maxResultsPerQuery);
  }

  const configured = configuredProviders(options.providerKeys);
  const providers = options.providers?.length
    ? options.providers
    : configured.length
      ? configured
      : options.useCache
        ? CACHE_REPLAY_PROVIDERS
        : [];
  if (providers.length === 0) {
    const message = "No live search providers configured; missing Serper, Exa, or Tavily API key.";
    options.onProviderError?.(message);
    return [];
  }

  const maxConcurrency = Math.max(1, options.maxConcurrency ?? 3);
  const tasks: Array<() => Promise<RawSearchResult[]>> = [];
  const allProviderErrors: string[] = [];
  const recordProviderError = (error: string) => {
    allProviderErrors.push(error);
    options.onProviderError?.(error);
  };
  for (const [queryIndex, query] of plan.queries.entries()) {
    for (const provider of providers) {
      tasks.push(async () => {
        if (options.abortSignal?.aborted) throw new RetrievalError("Retrieval aborted", [], 0);
        const providerQuery = queryForProvider(provider, query.query, query.expectedDomains);
        const legacyCacheKey = `${provider}:${providerQuery}:${query.bucketId}:${options.maxResultsPerQuery ?? query.maxResultsPerQuery}`;
        const retrievalCacheInput = {
          provider,
          query: providerQuery,
          mode: options.mode,
          topicType: options.topicType ?? plan.agendaContract.topicType,
          bucket: query.bucketId,
          maxResults: options.maxResultsPerQuery ?? query.maxResultsPerQuery,
          emit: (event: { type: string; data?: Record<string, unknown> }) => options.onCacheEvent?.(event.type, event.data ?? {}),
        };
        const retrievalCached = options.useCache ? retrievalCacheManager.getSearchResults(retrievalCacheInput) : null;
        if (retrievalCached) {
          options.onCacheEvent?.("cache_hit", { provider, query: query.query, bucketId: query.bucketId, layer: "retrieval_cache" });
          return retrievalCached;
        }
        if (options.useCache && options.cache) {
          const cached = options.cache.get<RawSearchResult[]>("search", legacyCacheKey);
          if (cached) {
            options.onCacheEvent?.("cache_hit", { provider, query: query.query, bucketId: query.bucketId });
            retrievalCacheManager.writeSearchResults(retrievalCacheInput, cached);
            return cached;
          }
          options.onCacheEvent?.("cache_miss", { provider, query: query.query, bucketId: query.bucketId });
        }
        const providerKey = keyForProvider(provider, options.providerKeys);
        if (!providerKey) {
          recordProviderError(`missing ${provider} api key`);
          return [];
        }

        try {
          const items = await withRetries(
            () => callSearchProvider(provider, query.query, providerKey, {
              queryOverride: providerQuery,
              fetchFn: options.fetchFn ?? multiKeyFetch,
              timeoutMs: options.timeoutMs ?? query.timeoutMs,
              abortSignal: options.abortSignal,
              maxResults: options.maxResultsPerQuery ?? query.maxResultsPerQuery,
              bucketId: query.bucketId,
            }),
            plan.retryPolicy.retries,
            plan.retryPolicy.backoffMs,
          );
          const fetchedAt = new Date().toISOString();
          const mapped = items.map((item, rawIndex): RawSearchResult => ({
            id: `${provider}-${query.id}-${queryIndex}-${rawIndex}`,
            title: item.title || item.url,
            url: item.url,
            domain: domainFromUrl(item.url),
            snippet: item.snippet,
            publishedDate: item.publishedDate,
            provider,
            discoveredBy: item.discoveredBy ?? [provider],
            foundByQuery: query.query,
            bucketId: query.bucketId,
            rawRank: rawIndex + 1,
            fetchedAt: item.retrievedAt ?? fetchedAt,
            retrievedAt: item.retrievedAt ?? fetchedAt,
          }));
          if (options.useCache && options.cache) options.cache.set("search", legacyCacheKey, mapped, { freshness: "fresh" });
          if (options.useCache) retrievalCacheManager.writeSearchResults(retrievalCacheInput, mapped);
          return mapped;
        } catch (error) {
          const safe = redactSecretString(error instanceof Error ? error.message : String(error));
          recordProviderError(`${provider}: ${safe}`);
          return [];
        }
      });
    }
  }

  const results = (await runLimited(tasks, maxConcurrency)).flat();

  // Check if ALL providers failed - now throw error instead of silent empty return
  const totalExpectedResults = plan.queries.reduce((sum, query) =>
    sum + (options.maxResultsPerQuery ?? query.maxResultsPerQuery) * providers.length, 0);

  if (results.length === 0 && allProviderErrors.length > 0 && totalExpectedResults > 0) {
    throw new RetrievalError(
      `All search providers failed. No results retrieved. Errors: ${allProviderErrors.length}`,
      allProviderErrors,
      0
    );
  }

  // If partial results exist but many providers failed, include warnings
  if (results.length > 0 && allProviderErrors.length > 0) {
    const errorRatio = allProviderErrors.length / (providers.length * plan.queries.length);
    if (errorRatio > 0.5) {
      logger.warn({ providerFailures: allProviderErrors.length, results: results.length }, "Retrieval returned partial results after provider failures");
    }
  }

  return results.slice(0, totalExpectedResults);
}

function deterministicSearch(plan: BucketedQueryPlan, maxResultsPerQuery?: number): RawSearchResult[] {
  return plan.queries.flatMap((query, index) => query.expectedDomains.slice(0, Math.max(1, Math.min(maxResultsPerQuery ?? 1, query.expectedDomains.length))).map((domain, domainIndex) => ({
    id: `${query.bucketId}-${index}-${domainIndex}`,
    title: `${query.query} source`,
    url: `https://${domain}/`,
    domain,
    snippet: query.query,
    publishedDate: null,
    provider: "deterministic-plan",
    foundByQuery: query.query,
    bucketId: query.bucketId,
    rawRank: domainIndex + 1,
    fetchedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
  })));
}

function configuredProviders(keys?: SearchExecutionOptions["providerKeys"]): SearchProviderName[] {
  const providers: SearchProviderName[] = [];
  if (keyForProvider("serper", keys)) providers.push("serper");
  if (keyForProvider("exa", keys)) providers.push("exa");
  if (keyForProvider("tavily", keys)) providers.push("tavily");
  if (keyForProvider("brave", keys)) providers.push("brave");
  return providers;
}

function keyForProvider(provider: SearchProviderName, keys?: SearchExecutionOptions["providerKeys"]): string | undefined {
  if (provider === "serper") return keys?.serper ?? process.env.SERPER_API_KEY ?? process.env.SERPER_KEY;
  if (provider === "exa") return keys?.exa ?? process.env.EXA_API_KEY;
  if (provider === "tavily") return keys?.tavily ?? process.env.TAVILY_API_KEY;
  if (provider === "brave") return keys?.brave ?? process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY;
  return undefined;
}

async function callSearchProvider(
  provider: SearchProviderName,
  query: string,
  apiKey: string,
  options: { fetchFn: typeof fetch; timeoutMs: number; maxResults: number; bucketId?: SourceBucketId; queryOverride?: string; abortSignal?: AbortSignal },
): Promise<ProviderSearchItem[]> {
  const runtime = createSearchRuntimeMetadata();
  const results = await searchWithFallback({
    query: options.queryOverride ?? query,
    mode: providerSearchMode(provider, options.bucketId),
    bucketId: options.bucketId,
    maxResults: options.maxResults,
  }, {
    providers: [provider],
    keys: { [provider]: apiKey },
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
    abortSignal: options.abortSignal,
    runtime,
  });
  const providerFailures = runtime.providerFailures.filter((failure) => failure.provider === provider);
  if (results.length === 0 && providerFailures.length > 0) {
    throw new Error(providerFailures.map((failure) => failure.error).join("; "));
  }
  return results.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.snippet ?? "",
    publishedDate: result.publishedDate ?? null,
    discoveredBy: (result.metadata?.discoveredBy as string[] | undefined) ?? [provider],
    retrievedAt: result.retrievedAt,
  }));
}

function queryForProvider(provider: SearchProviderName, query: string, expectedDomains: string[] = []): string {
  if (provider === "brave") return query;
  const siteDomains = [...query.matchAll(/\bsite:([^\s)]+)/gi)].map((match) => match[1]);
  const domainTerms = [...new Set([...siteDomains, ...expectedDomains.slice(0, 4)])].filter(Boolean);
  if (provider === "serper") {
    return [domainTerms.join(" "), stripSiteOperators(query)]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return [domainTerms.join(" "), stripSiteOperators(query)]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSiteOperators(query: string): string {
  const rewritten = query
    .replace(/\(?\s*site:[^\s)]+(?:\s+OR\s+site:[^\s)]+)*\s*\)?/gi, " ")
    .replace(/\bOR\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rewritten;
}

function providerSearchMode(provider: SearchProviderName, bucketId?: SourceBucketId): "web" | "news" | "academic" | "legal" | "official" | "semantic" {
  if (provider === "exa") return "semantic";
  return searchModeForBucket(bucketId);
}

async function callTavily(query: string, apiKey: string, options: { fetchFn: typeof fetch; timeoutMs: number; maxResults: number; abortSignal?: AbortSignal }): Promise<ProviderSearchItem[]> {
  const response = await fetchWithTimeout(options.fetchFn, "https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: "advanced", max_results: options.maxResults, include_answer: false }),
    signal: options.abortSignal,
  }, options.timeoutMs);
  if (!response.ok) throw new Error(`Tavily search failed: ${response.status} ${await safeResponseText(response)}`);
  const data = await response.json() as any;
  return (data.results ?? []).slice(0, options.maxResults).map((item: any) => ({
    title: item.title ?? item.url ?? query,
    url: item.url,
    snippet: item.content ?? item.snippet ?? "",
    publishedDate: item.published_date ?? item.publishedDate ?? null,
  })).filter((item: ProviderSearchItem) => item.url);
}

async function callBrave(query: string, apiKey: string, options: { fetchFn: typeof fetch; timeoutMs: number; maxResults: number; abortSignal?: AbortSignal }): Promise<ProviderSearchItem[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(options.maxResults, 20)}`;
  const response = await fetchWithTimeout(options.fetchFn, url, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey }, signal: options.abortSignal }, options.timeoutMs);
  if (!response.ok) throw new Error(`Brave search failed: ${response.status} ${await safeResponseText(response)}`);
  const data = await response.json() as any;
  return (data.web?.results ?? []).slice(0, options.maxResults).map((item: any) => ({
    title: item.title ?? item.url ?? query,
    url: item.url,
    snippet: item.description ?? item.snippet ?? "",
    publishedDate: item.age ?? null,
  })).filter((item: ProviderSearchItem) => item.url);
}

async function callSerper(query: string, apiKey: string, options: { fetchFn: typeof fetch; timeoutMs: number; maxResults: number; abortSignal?: AbortSignal }): Promise<ProviderSearchItem[]> {
  const maxResults = Math.min(10, Math.max(1, options.maxResults));
  const response = await fetchWithTimeout(options.fetchFn, "https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: maxResults }),
    signal: options.abortSignal,
  }, options.timeoutMs);
  if (!response.ok) throw new Error(`Serper search failed: ${response.status} ${await safeResponseText(response)}`);
  const data = await response.json() as any;
  return (data.organic ?? []).slice(0, maxResults).map((item: any) => ({
    title: item.title ?? item.link ?? query,
    url: item.link,
    snippet: item.snippet ?? "",
    publishedDate: item.date ?? null,
  })).filter((item: ProviderSearchItem) => item.url);
}

async function fetchWithTimeout(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    externalSignal?.removeEventListener("abort", abortFromExternal);
    clearTimeout(timeout);
  }
}

async function withRetries<T>(fn: () => Promise<T>, retries: number, backoffMs: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
    }
  }
  throw lastError;
}

async function runLimited<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        // FIX BUG-1: Handle individual task failures gracefully instead of failing entire batch
        console.warn(`Task ${index} failed, continuing with remaining tasks`, error);
        results[index] = undefined as T;
      }
    }
  });
  // FIX BUG-1: Use Promise.allSettled for graceful degradation
  await Promise.allSettled(workers);
  return results.filter(r => r !== undefined);
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return redactSecretString((await response.text()).slice(0, 1000));
  } catch {
    return "";
  }
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}
