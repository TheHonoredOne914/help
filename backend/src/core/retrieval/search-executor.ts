import type { SourceBucketId } from "./source-buckets.js";
import type { BucketedQueryPlan } from "./query-planner.js";
import { redactSecretString } from "../security/secret-redaction.js";
import type { CacheManager } from "../../services/cache-manager.js";
import { createSearchRuntimeMetadata, searchWithFallback } from "../search/search-provider-router.js";
import { getSearchProviderOrderForBucket, searchModeForBucket } from "../search/search-fallback-policy.js";
import type { ExtractorProviderName, SearchOnlyProviderName } from "../search/search-provider-types.js";
import { retrievalCacheManager } from "../retrieval-cache/index.js";
import type { ResearchMode } from "../config/research-mode.js";
import { logger } from "../../lib/logger.js";
import { multiKeyFetch } from "../../lib/multi-key-fetch.js";

const HEDGE_MS = 1800;

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
  const maxProviderAttempts = maxSearchAttemptsForMode(options.mode, providers.length);
  const tasks: Array<() => Promise<RawSearchResult[]>> = [];
  const allProviderErrors: string[] = [];
  const recordProviderError = (error: string) => {
    allProviderErrors.push(error);
    options.onProviderError?.(error);
  };
  for (const [queryIndex, query] of plan.queries.entries()) {
    tasks.push(async () => {
      if (options.abortSignal?.aborted) throw new RetrievalError("Retrieval aborted", [], 0);
      const available = {
        serper: Boolean(keyForProvider("serper", options.providerKeys)),
        exa: Boolean(keyForProvider("exa", options.providerKeys)),
        tavily: Boolean(keyForProvider("tavily", options.providerKeys)),
        brave: Boolean(keyForProvider("brave", options.providerKeys)),
      };
      const bucketOrder = getSearchProviderOrderForBucket(query.bucketId, options.mode, available);
      // Keep the full available order. Hedged search races the first two, then
      // walks the rest on empty results — slicing here would hide working keys.
      const providerOrder = (bucketOrder.length ? bucketOrder : rotateProviders(providers, queryIndex))
        .filter((provider) => providers.includes(provider))
        .slice(0, Math.max(maxProviderAttempts, 4));
      if (providerOrder.length === 0) return [];
      const found = await hedgedProviderSearch({
        providerOrder,
        query,
        queryIndex,
        plan,
        options,
        recordProviderError,
      });
      const cap = options.maxResultsPerQuery ?? query.maxResultsPerQuery;
      return found.slice(0, Math.max(0, cap));
    });
  }

  const results = (await runLimited(tasks, maxConcurrency)).flat();

  // Check if ALL providers failed - now throw error instead of silent empty return
  const totalExpectedResults = plan.queries.reduce((sum, query) =>
    sum + (options.maxResultsPerQuery ?? query.maxResultsPerQuery), 0);

  if (results.length === 0 && allProviderErrors.length > 0 && totalExpectedResults > 0) {
    throw new RetrievalError(
      `All search providers failed. No results retrieved. Errors: ${allProviderErrors.length}`,
      allProviderErrors,
      0
    );
  }

  // If partial results exist but many providers failed, include warnings
  if (results.length > 0 && allProviderErrors.length > 0) {
    const errorRatio = allProviderErrors.length / Math.max(1, plan.queries.length);
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

function rotateProviders(providers: SearchProviderName[], offset: number): SearchProviderName[] {
  if (providers.length === 0) return [];
  const start = offset % providers.length;
  return [...providers.slice(start), ...providers.slice(0, start)];
}

function maxSearchAttemptsForMode(mode: ResearchMode | undefined, providerCount: number): number {
  if (providerCount <= 1) return Math.max(1, providerCount);
  if (mode === "fast_research") return Math.min(2, providerCount);
  return Math.min(3, providerCount);
}

async function hedgedProviderSearch(args: {
  providerOrder: SearchProviderName[];
  query: BucketedQueryPlan["queries"][number];
  queryIndex: number;
  plan: BucketedQueryPlan;
  options: SearchExecutionOptions;
  recordProviderError: (error: string) => void;
}): Promise<RawSearchResult[]> {
  const { providerOrder, query, queryIndex, plan, options, recordProviderError } = args;
  const primary = providerOrder[0]!;
  const secondary = providerOrder[1];

  // Single cache key on primary — hedge must not double-write.
  const cacheProvider = primary;
  const providerQuery = queryForProvider(primary, query.query, query.expectedDomains);
  const retrievalCacheInput = {
    provider: cacheProvider,
    query: providerQuery,
    mode: options.mode,
    topicType: options.topicType ?? plan.agendaContract.topicType,
    bucket: query.bucketId,
    maxResults: options.maxResultsPerQuery ?? query.maxResultsPerQuery,
    emit: (event: { type: string; data?: Record<string, unknown> }) => options.onCacheEvent?.(event.type, event.data ?? {}),
  };
  const retrievalCached = options.useCache ? retrievalCacheManager.getSearchResults(retrievalCacheInput) : null;
  if (retrievalCached) {
    options.onCacheEvent?.("cache_hit", { provider: cacheProvider, query: query.query, bucketId: query.bucketId, layer: "retrieval_cache" });
    // Cached rows may predate diversify (or be primary-only). Still merge one
    // unused provider so Exa-only cache hits do not starve unique URLs.
    const diversified = await diversifySingleProviderMapped({
      mapped: retrievalCached,
      providerOrder,
      query,
      queryIndex,
      plan,
      options,
      recordProviderError,
    });
    if (
      options.useCache
      && diversified.length > 0
      && new Set(diversified.map((row) => row.provider)).size > new Set(retrievalCached.map((row) => row.provider)).size
    ) {
      retrievalCacheManager.writeSearchResults(retrievalCacheInput, diversified);
    }
    return diversified;
  }
  if (options.useCache) {
    options.onCacheEvent?.("cache_miss", { provider: cacheProvider, query: query.query, bucketId: query.bucketId, layer: "retrieval_cache" });
  }

  const primaryPromise = searchOneProviderLive({
    provider: primary,
    query,
    queryIndex,
    plan,
    options,
    recordProviderError,
  });

  let mapped: RawSearchResult[];
  if (!secondary) {
    mapped = await primaryPromise;
  } else {
    const raced = await Promise.race([
      primaryPromise.then((rows) => ({ kind: "primary" as const, rows })),
      sleep(HEDGE_MS, options.abortSignal).then(() => ({ kind: "timer" as const, rows: [] as RawSearchResult[] })),
    ]);
    if (raced.kind === "primary" && raced.rows.length > 0) {
      mapped = raced.rows;
    } else {
      const [primaryRows, secondaryRows] = await Promise.all([
        raced.kind === "primary" ? Promise.resolve(raced.rows) : primaryPromise,
        searchOneProviderLive({
          provider: secondary,
          query,
          queryIndex,
          plan,
          options,
          recordProviderError,
        }),
      ]);
      mapped = mergeRawByUrl([...primaryRows, ...secondaryRows]);
    }
  }

  // If hedge pair returned nothing, keep walking the remaining provider order
  // so a bad Serper/Brave key cannot hide working Tavily/Exa keys.
  if (mapped.length === 0 && providerOrder.length > 2) {
    for (const provider of providerOrder.slice(2)) {
      const more = await searchOneProviderLive({
        provider,
        query,
        queryIndex,
        plan,
        options,
        recordProviderError,
      });
      if (more.length > 0) {
        mapped = more;
        break;
      }
    }
  }

  mapped = await diversifySingleProviderMapped({
    mapped,
    providerOrder,
    query,
    queryIndex,
    plan,
    options,
    recordProviderError,
  });

  // Never cache empty miss/failure results — that poisons later runs into permanent empty search.
  if (options.useCache && mapped.length > 0) {
    retrievalCacheManager.writeSearchResults(retrievalCacheInput, mapped);
  }
  return mapped;
}

/** When only one search provider contributed rows, merge one unused provider for URL diversity. */
async function diversifySingleProviderMapped(args: {
  mapped: RawSearchResult[];
  providerOrder: SearchProviderName[];
  query: BucketedQueryPlan["queries"][number];
  queryIndex: number;
  plan: BucketedQueryPlan;
  options: SearchExecutionOptions;
  recordProviderError: (error: string) => void;
}): Promise<RawSearchResult[]> {
  const { mapped, providerOrder, query, queryIndex, plan, options, recordProviderError } = args;
  if (mapped.length === 0 || providerOrder.length < 2) return mapped;
  const used = new Set(mapped.map((row) => row.provider));
  if (used.size > 1) return mapped;
  // Include secondary (index 1): a primary-only hedge win previously skipped it via slice(2).
  for (const provider of providerOrder) {
    if (used.has(provider)) continue;
    const more = await searchOneProviderLive({
      provider,
      query,
      queryIndex,
      plan,
      options,
      recordProviderError,
    });
    if (more.length > 0) {
      return mergeRawByUrl([...mapped, ...more]);
    }
  }
  return mapped;
}

async function searchOneProviderLive(args: {
  provider: SearchProviderName;
  query: BucketedQueryPlan["queries"][number];
  queryIndex: number;
  plan: BucketedQueryPlan;
  options: SearchExecutionOptions;
  recordProviderError: (error: string) => void;
}): Promise<RawSearchResult[]> {
  const { provider, query, queryIndex, plan, options, recordProviderError } = args;
  const providerQuery = queryForProvider(provider, query.query, query.expectedDomains);
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
    return items.map((item, rawIndex): RawSearchResult => ({
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
  } catch (error) {
    const safe = redactSecretString(error instanceof Error ? error.message : String(error));
    recordProviderError(`${provider}: ${safe}`);
    return [];
  }
}

function mergeRawByUrl(results: RawSearchResult[]): RawSearchResult[] {
  const map = new Map<string, RawSearchResult>();
  for (const result of results) {
    const key = result.url.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, result);
      continue;
    }
    map.set(key, {
      ...existing,
      discoveredBy: [...new Set([...(existing.discoveredBy ?? [existing.provider]), ...(result.discoveredBy ?? [result.provider])])],
      rawRank: Math.min(existing.rawRank, result.rawRank),
    });
  }
  return [...map.values()].sort((a, b) => a.rawRank - b.rawRank);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    }, { once: true });
  });
}

async function searchOneProvider(args: {
  provider: SearchProviderName;
  query: BucketedQueryPlan["queries"][number];
  queryIndex: number;
  plan: BucketedQueryPlan;
  options: SearchExecutionOptions;
  recordProviderError: (error: string) => void;
}): Promise<RawSearchResult[]> {
  return hedgedProviderSearch({
    providerOrder: [args.provider],
    query: args.query,
    queryIndex: args.queryIndex,
    plan: args.plan,
    options: args.options,
    recordProviderError: args.recordProviderError,
  });
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
      if (isAbortError(error)) throw error;
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

function isAbortError(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { name?: string }).name === "AbortError";
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}
