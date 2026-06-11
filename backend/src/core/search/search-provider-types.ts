import type { ResearchMode } from "../config/research-mode.js";

export type SearchProviderName = "serper" | "exa" | "tavily" | "brave" | "firecrawl" | "jina" | "scraperapi" | "zenrows" | "scrapingbee" | "geekflare";
export type SearchOnlyProviderName = "serper" | "exa" | "tavily" | "brave";
export type ExtractorProviderName = "firecrawl" | "jina" | "scraperapi" | "zenrows" | "scrapingbee" | "geekflare";
export type ExtractionProviderName = ExtractorProviderName | "web_service" | "snippet_fallback";

export interface SearchProviderKeys {
  serper?: string | null;
  exa?: string | null;
  tavily?: string | null;
  brave?: string | null;
  firecrawl?: string | null;
  jina?: string | null;
  scraperapi?: string | null;
  zenrows?: string | null;
  scrapingbee?: string | null;
  geekflare?: string | null;
}

export interface SearchQuery {
  query: string;
  mode: "web" | "news" | "academic" | "legal" | "official" | "semantic";
  bucketId?: string;
  maxResults?: number;
  freshnessDays?: number;
  domains?: string[];
  excludeDomains?: string[];
  locale?: string;
  country?: string;
}

export interface NormalizedSearchResult {
  id: string;
  provider: SearchProviderName;
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
  author?: string;
  sourceName?: string;
  rawRank?: number;
  semanticScore?: number;
  providerScore?: number;
  bucketId?: string;
  query: string;
  retrievedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ExtractedPageContent {
  url: string;
  provider: ExtractionProviderName;
  title?: string;
  markdown?: string;
  text?: string;
  html?: string;
  excerpt?: string;
  status: "success" | "partial" | "failed";
  error?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export type SearchProviderStatusValue =
  | "healthy"
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "network_error"
  | "timeout"
  | "aborted"
  | "unavailable"
  | "status_unknown";

export interface SearchProviderHealth {
  provider: SearchProviderName;
  configured: boolean;
  configuredFrom?: "browser" | "server_env" | "none";
  healthy: boolean;
  status: SearchProviderStatusValue;
  canSearch: boolean;
  canExtract: boolean;
  latencyMs?: number;
  error?: string;
}

export interface SearchProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface ExtractorOptions extends SearchProviderOptions {
  snippet?: string | null;
}

export interface SearchProvider {
  name: SearchOnlyProviderName;
  configured(keys: SearchProviderKeys): boolean;
  search(query: SearchQuery, keys: SearchProviderKeys, options: SearchProviderOptions): Promise<NormalizedSearchResult[]>;
  healthCheck?(keys: SearchProviderKeys, options?: SearchProviderOptions): Promise<SearchProviderHealth>;
}

export interface ExtractorProvider {
  name: ExtractorProviderName;
  configured(keys: SearchProviderKeys): boolean;
  extract(url: string, keys: SearchProviderKeys, options: ExtractorOptions): Promise<ExtractedPageContent>;
  healthCheck?(keys: SearchProviderKeys, options?: SearchProviderOptions): Promise<SearchProviderHealth>;
}

export type SearchProviderAvailability = Partial<Record<SearchOnlyProviderName, boolean>>;
export type ExtractorProviderAvailability = Partial<Record<ExtractorProviderName, boolean>>;
export type ExtractorProviderKeys = Partial<Record<ExtractorProviderName, string | undefined>>;

export interface SearchRuntimeMetadata {
  searchProvidersUsed: string[];
  extractionProvidersUsed: string[];
  disabledExtractionProviders?: string[];
  providerFailures: Array<{ provider: string; status?: string; error: string }>;
  sourceCountsByProvider: Record<string, number>;
  extractionProviderBreakdown: Record<string, number>;
  fallbackExtractionCount: number;
}

export type SearchPolicyMode = ResearchMode | "web_search";
