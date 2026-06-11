import { braveSearchProvider } from "./providers/brave-search-provider.js";
import { exaSearchProvider } from "./providers/exa-search-provider.js";
import { firecrawlExtractorProvider } from "./providers/firecrawl-extractor-provider.js";
import { geekflareExtractorProvider } from "./providers/geekflare-extractor-provider.js";
import { jinaExtractorProvider } from "./providers/jina-extractor-provider.js";
import { scraperapiExtractorProvider } from "./providers/scraperapi-extractor-provider.js";
import { scrapingbeeExtractorProvider } from "./providers/scrapingbee-extractor-provider.js";
import { serperSearchProvider } from "./providers/serper-search-provider.js";
import { tavilySearchProvider } from "./providers/tavily-search-provider.js";
import { zenrowsExtractorProvider } from "./providers/zenrows-extractor-provider.js";
import { classifyProviderError, redactKnownSecretValues, safeProviderError } from "./search-provider-errors.js";
import { assertSafeSourceFetchUrl } from "../security/source-url-policy.js";
import { logProviderCall } from "../providers/provider-call-logger.js";
import { getExtractionProviderOrder, getSearchProviderOrder } from "./search-fallback-policy.js";
import { mergeSearchResultsByUrl } from "./search-result-normalizer.js";
import { createExtractionCooldown, recordExtractionFailure, shouldSkipExtractionProvider, type ExtractionCooldownState } from "../providers/limits/extraction-cooldown.js";
import type { ExtractedPageContent, ExtractorProvider, ExtractorProviderName, ExtractionProviderName, NormalizedSearchResult, SearchOnlyProviderName, SearchPolicyMode, SearchProvider, SearchProviderKeys, SearchQuery, SearchRuntimeMetadata } from "./search-provider-types.js";

const SEARCH_PROVIDERS: Record<SearchOnlyProviderName, SearchProvider> = {
  serper: serperSearchProvider,
  exa: exaSearchProvider,
  tavily: tavilySearchProvider,
  brave: braveSearchProvider,
};

const EXTRACTORS: Record<ExtractorProviderName, ExtractorProvider> = {
  firecrawl: firecrawlExtractorProvider,
  jina: jinaExtractorProvider,
  scraperapi: scraperapiExtractorProvider,
  zenrows: zenrowsExtractorProvider,
  scrapingbee: scrapingbeeExtractorProvider,
  geekflare: geekflareExtractorProvider,
};

export interface SearchWithFallbackOptions {
  keys: SearchProviderKeys;
  mode?: SearchPolicyMode;
  providers?: SearchOnlyProviderName[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  onProviderError?: (error: string) => void;
  runtime?: SearchRuntimeMetadata;
}

export async function searchWithFallback(query: SearchQuery, options: SearchWithFallbackOptions): Promise<NormalizedSearchResult[]> {
  const available = providerAvailability(options.keys);
  const providers = options.providers?.length ? options.providers : getSearchProviderOrder(options.mode ?? "deep_research", available);
  const runtime = options.runtime;
  const results: NormalizedSearchResult[] = [];
  for (const providerName of providers) {
    const provider = SEARCH_PROVIDERS[providerName];
    if (!provider.configured(options.keys)) {
      const message = `missing ${providerName} api key`;
      options.onProviderError?.(message);
      runtime?.providerFailures.push({ provider: providerName, status: "missing_key", error: message });
      continue;
    }
    const providerStarted = Date.now();
    try {
      const providerResults = await provider.search(query, options.keys, { fetchFn: options.fetchFn, timeoutMs: options.timeoutMs, abortSignal: options.abortSignal });
      logProviderCall({
        event: "search_provider_call",
        providerName,
        providerKind: "search",
        operation: "search",
        statusCode: 200,
        latencyMs: Date.now() - providerStarted,
        query: query.query,
        resultCount: providerResults.length,
        success: true,
      });
      if (providerResults.length > 0) {
        if (runtime) {
          runtime.searchProvidersUsed.push(providerName);
          runtime.sourceCountsByProvider[providerName] = (runtime.sourceCountsByProvider[providerName] ?? 0) + providerResults.length;
        }
      }
      results.push(...providerResults);
    } catch (error) {
      logProviderCall({
        event: "search_provider_call",
        providerName,
        providerKind: "search",
        operation: "search",
        statusCode: (error as any)?.statusCode ?? null,
        latencyMs: Date.now() - providerStarted,
        query: query.query,
        errorCode: classifyProviderError(error),
        success: false,
      });
      const message = `${providerName}: ${safeProviderError(error)}`;
      options.onProviderError?.(message);
      runtime?.providerFailures.push({ provider: providerName, status: classifyProviderError(error), error: message });
    }
  }
  return mergeSearchResultsByUrl(results);
}

export interface ExtractWithFallbackOptions {
  keys: SearchProviderKeys;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  snippet?: string | null;
  runtime?: SearchRuntimeMetadata;
  abortSignal?: AbortSignal;
  disabledExtractionProviders?: Set<ExtractorProviderName>;
  extractionCooldown?: ExtractionCooldownState;
}

export async function extractWithFallback(url: string, options: ExtractWithFallbackOptions): Promise<ExtractedPageContent> {
  let safeUrl: URL;
  try {
    safeUrl = await assertSafeSourceFetchUrl(url, { resolveDns: (options.fetchFn ?? fetch) === fetch });
  } catch (error) {
    const message = safeProviderError(error, "Unsafe source URL blocked");
    options.runtime?.providerFailures.push({ provider: "extractor", status: "unavailable", error: message });
    options.runtime?.extractionProvidersUsed.push("snippet_fallback");
    if (options.runtime) {
      options.runtime.fallbackExtractionCount += 1;
      options.runtime.extractionProviderBreakdown.snippet_fallback = (options.runtime.extractionProviderBreakdown.snippet_fallback ?? 0) + 1;
    }
    return {
      url,
      provider: "snippet_fallback",
      excerpt: options.snippet ?? undefined,
      text: options.snippet ?? undefined,
      status: options.snippet ? "partial" : "failed",
      error: message,
      metadata: { fallbackExtractionUsed: true },
    };
  }
  const disabled = options.disabledExtractionProviders ?? new Set<ExtractorProviderName>();
  const order = getExtractionProviderOrder({
    firecrawl: Boolean(options.keys.firecrawl?.trim()),
    jina: Boolean(options.keys.jina?.trim()),
    scraperapi: Boolean(options.keys.scraperapi?.trim()) && process.env.SCRAPERAPI_ENABLED === "true",
    zenrows: Boolean(options.keys.zenrows?.trim()),
    scrapingbee: Boolean(options.keys.scrapingbee?.trim()),
    geekflare: Boolean(options.keys.geekflare?.trim()),
  }).filter((providerName) => providerName === "snippet_fallback" || providerName === "web_service" || !disabled.has(providerName as ExtractorProviderName));
  let lastError: string | undefined;
  let fallbackExtractionUsed = false;
  const cooldown = options.extractionCooldown;
  for (const providerName of order) {
    if (providerName === "snippet_fallback" || providerName === "web_service") continue;

    // Check cooldown state before attempting extraction
    if (cooldown && isCooldownTrackedProvider(providerName) && shouldSkipExtractionProvider(cooldown, providerName, safeUrl.href)) {
      continue;
    }

    const extractorStarted = Date.now();
    try {
      const result = await EXTRACTORS[providerName as ExtractorProviderName].extract(safeUrl.href, options.keys, { fetchFn: options.fetchFn, timeoutMs: options.timeoutMs, snippet: options.snippet, abortSignal: options.abortSignal });
      logProviderCall({
        event: "extraction_provider_call",
        providerName,
        providerKind: "extraction",
        operation: "extract",
        statusCode: result.status === "failed" ? 502 : 200,
        latencyMs: result.latencyMs ?? Date.now() - extractorStarted,
        success: result.status !== "failed",
      });
      if (options.runtime) {
        options.runtime.extractionProvidersUsed.push(providerName);
        options.runtime.extractionProviderBreakdown[providerName] = (options.runtime.extractionProviderBreakdown[providerName] ?? 0) + 1;
      }
      return { ...result, metadata: { ...(result.metadata ?? {}), fallbackExtractionUsed } };
    } catch (error) {
      const httpStatus = (error as any)?.statusCode;
      logProviderCall({
        event: "extraction_provider_call",
        providerName,
        providerKind: "extraction",
        operation: "extract",
        statusCode: httpStatus ?? null,
        latencyMs: Date.now() - extractorStarted,
        errorCode: classifyProviderError(error),
        success: false,
      });
      fallbackExtractionUsed = true;
      lastError = `${providerName}: ${redactKnownSecretValues(safeProviderError(error), Object.values(options.keys))}`;
      const status = classifyProviderError(error);
      options.runtime?.providerFailures.push({ provider: providerName, status, error: lastError });

      // Record in cooldown tracker
      if (cooldown && isCooldownTrackedProvider(providerName)) {
        recordExtractionFailure(cooldown, providerName, httpStatus, safeUrl.href);
      }

      if (status === "invalid_key" || httpStatus === 402 || httpStatus === 429) {
        disabled.add(providerName as ExtractorProviderName);
        if (options.runtime) {
          options.runtime.disabledExtractionProviders ??= [];
          if (!options.runtime.disabledExtractionProviders.includes(providerName)) {
            options.runtime.disabledExtractionProviders.push(providerName);
          }
        }
      }
    }
  }
  options.runtime?.extractionProvidersUsed.push("snippet_fallback");
  if (options.runtime) {
    options.runtime.fallbackExtractionCount += 1;
    options.runtime.extractionProviderBreakdown.snippet_fallback = (options.runtime.extractionProviderBreakdown.snippet_fallback ?? 0) + 1;
  }
  return {
    url,
    provider: "snippet_fallback",
    excerpt: options.snippet ?? undefined,
    text: options.snippet ?? undefined,
    status: options.snippet ? "partial" : "failed",
    error: lastError ?? "No extraction provider configured; snippet fallback used",
    metadata: { fallbackExtractionUsed: true },
  };
}

function isCooldownTrackedProvider(provider: string): provider is "firecrawl" | "jina" {
  return provider === "firecrawl" || provider === "jina";
}

export function createSearchRuntimeMetadata(): SearchRuntimeMetadata {
  return {
    searchProvidersUsed: [],
    extractionProvidersUsed: [],
    disabledExtractionProviders: [],
    providerFailures: [],
    sourceCountsByProvider: {},
    extractionProviderBreakdown: {},
    fallbackExtractionCount: 0,
  };
}

export function providerAvailability(keys: SearchProviderKeys): Record<SearchOnlyProviderName, boolean> {
  return {
    serper: Boolean(keys.serper?.trim()),
    exa: Boolean(keys.exa?.trim()),
    tavily: Boolean(keys.tavily?.trim()),
    brave: Boolean(keys.brave?.trim()),
  };
}

export function configuredSearchProviders(keys: SearchProviderKeys, mode: SearchPolicyMode = "deep_research"): SearchOnlyProviderName[] {
  return getSearchProviderOrder(mode, providerAvailability(keys));
}

export function allSearchProviders(): SearchProvider[] {
  return Object.values(SEARCH_PROVIDERS);
}

export function allExtractorProviders(): ExtractorProvider[] {
  return Object.values(EXTRACTORS);
}
