import { serperSearchProvider } from "./providers/serper-search-provider.js";
import { exaSearchProvider } from "./providers/exa-search-provider.js";
import { tavilySearchProvider } from "./providers/tavily-search-provider.js";
import { braveSearchProvider } from "./providers/brave-search-provider.js";
import type {
  SearchProviderName,
  SearchOnlyProviderName,
  SearchProviderKeys,
  SearchQuery,
  SearchProvider,
  SearchProviderHealth,
  NormalizedSearchResult,
} from "./search-provider-types.js";

export interface UnifiedSearchOptions {
  keys: SearchProviderKeys;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  onProviderError?: (error: string) => void;
  onProviderLatency?: (latency: ProviderLatencyRecord) => void;
}

export interface ProviderLatencyRecord {
  provider: SearchOnlyProviderName;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface SearchCapabilityScore {
  provider: SearchOnlyProviderName;
  score: number;
  strengths: string[];
  weaknesses: string[];
}

export interface UnifiedSearchResult extends NormalizedSearchResult {
  capabilityScore: number;
  freshnessScore: number;
  provenance: SearchProvenance;
}

export interface SearchProvenance {
  primaryProvider: SearchOnlyProviderName;
  fallbackProviders: SearchOnlyProviderName[];
  attempts: number;
  totalLatencyMs: number;
  failedProviders: string[];
  retryCount: number;
  timestamp: string;
}

const DEFAULT_PROVIDER_CAPABILITIES: Record<SearchOnlyProviderName, SearchCapabilityScore> = {
  serper: {
    provider: "serper",
    score: 95,
    strengths: ["Google index", "fresh news", "high coverage"],
    weaknesses: ["no semantic search", "limited advanced queries"],
  },
  exa: {
    provider: "exa",
    score: 90,
    strengths: ["semantic search", "high quality", "good for research"],
    weaknesses: ["slower", "rate limits"],
  },
  tavily: {
    provider: "tavily",
    score: 85,
    strengths: ["AI-optimized", "good for complex queries"],
    weaknesses: ["smaller index", "occasional timeouts"],
  },
  brave: {
    provider: "brave",
    score: 80,
    strengths: ["privacy-focused", "good general results"],
    weaknesses: ["less India-specific", "smaller news coverage"],
  },
};

export class UnifiedSearchRouter {
  private providers: Record<SearchOnlyProviderName, SearchProvider>;
  private providerCapabilities: Record<SearchOnlyProviderName, SearchCapabilityScore>;
  private healthCache = new Map<SearchOnlyProviderName, { health: SearchProviderHealth; timestamp: number }>();
  private healthCacheTtlMs = 60_000;

  constructor() {
    this.providers = {
      serper: serperSearchProvider,
      exa: exaSearchProvider,
      tavily: tavilySearchProvider,
      brave: braveSearchProvider,
    };
    this.providerCapabilities = { ...DEFAULT_PROVIDER_CAPABILITIES };
  }

  async search(query: SearchQuery, options: UnifiedSearchOptions): Promise<UnifiedSearchResult[]> {
    const availableProviders = this.getConfiguredProviders(options.keys);
    if (availableProviders.length === 0) {
      const error = "No search providers configured";
      options.onProviderError?.(error);
      return [];
    }

    const prioritizedProviders = this.prioritizeProviders(availableProviders, query.mode);
    const results: UnifiedSearchResult[] = [];
    const failedProviders: string[] = [];
    const fallbackProviders: SearchOnlyProviderName[] = [];
    let totalLatencyMs = 0;
    let retryCount = 0;

    for (const providerName of prioritizedProviders) {
      const provider = this.providers[providerName];
      const startTime = Date.now();

      try {
        const providerResults = await this.callWithRetry(
          () => provider.search(query, options.keys, { fetchFn: options.fetchFn, timeoutMs: options.timeoutMs }),
          options.maxRetries ?? 2,
          options.retryBackoffMs ?? 500,
        );

        const latencyMs = Date.now() - startTime;
        totalLatencyMs += latencyMs;

        options.onProviderLatency?.({
          provider: providerName,
          latencyMs,
          success: true,
        });

        const capabilityScore = this.providerCapabilities[providerName].score;
        const processedResults = providerResults.map((result) => ({
          ...result,
          capabilityScore,
          freshnessScore: this.calculateFreshnessScore(result),
          provenance: {
            primaryProvider: providerName,
            fallbackProviders: [...fallbackProviders],
            attempts: fallbackProviders.length + 1,
            totalLatencyMs,
            failedProviders: [...failedProviders],
            retryCount,
            timestamp: new Date().toISOString(),
          },
        } as UnifiedSearchResult));

        results.push(...processedResults);
        break;
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        failedProviders.push(providerName);
        fallbackProviders.push(providerName);
        retryCount += (options.maxRetries ?? 2);

        options.onProviderError?.(`${providerName}: ${errorMessage}`);
        options.onProviderLatency?.({
          provider: providerName,
          latencyMs,
          success: false,
          error: errorMessage,
        });
      }
    }

    const deduplicated = this.deduplicateResults(results);
    return deduplicated;
  }

  async healthCheck(keys: SearchProviderKeys): Promise<Record<SearchOnlyProviderName, SearchProviderHealth>> {
    const results: Record<string, SearchProviderHealth> = {};

    for (const [name, provider] of Object.entries(this.providers) as [SearchOnlyProviderName, SearchProvider][]) {
      const cached = this.healthCache.get(name);
      if (cached && Date.now() - cached.timestamp < this.healthCacheTtlMs) {
        results[name] = cached.health;
        continue;
      }

      try {
        const health = provider.healthCheck
          ? await provider.healthCheck(keys, { timeoutMs: 5000 })
          : await this.performHealthCheck(provider, keys);
        this.healthCache.set(name, { health, timestamp: Date.now() });
        results[name] = health;
      } catch (error) {
        results[name] = {
          provider: name as SearchProviderName,
          configured: Boolean(keys[name as keyof SearchProviderKeys]),
          healthy: false,
          status: "network_error",
          canSearch: false,
          canExtract: false,
          error: error instanceof Error ? error.message : "health check failed",
        };
      }
    }

    return results as Record<SearchOnlyProviderName, SearchProviderHealth>;
  }

  private async performHealthCheck(provider: SearchProvider, keys: SearchProviderKeys): Promise<SearchProviderHealth> {
    const configured = provider.configured(keys);
    return {
      provider: provider.name as SearchProviderName,
      configured,
      healthy: configured,
      status: configured ? "healthy" : "missing_key",
      canSearch: configured,
      canExtract: false,
    };
  }

  private getConfiguredProviders(keys: SearchProviderKeys): SearchOnlyProviderName[] {
    return (Object.keys(this.providers) as SearchOnlyProviderName[]).filter((name) => this.providers[name].configured(keys));
  }

  private prioritizeProviders(providers: SearchOnlyProviderName[], mode: SearchQuery["mode"]): SearchOnlyProviderName[] {
    const scores = providers.map((provider) => ({
      provider,
      score: this.calculateProviderScore(provider, mode),
    }));

    return scores.sort((a, b) => b.score - a.score).map((s) => s.provider);
  }

  private calculateProviderScore(provider: SearchOnlyProviderName, mode: SearchQuery["mode"]): number {
    const capability = this.providerCapabilities[provider];
    let score = capability.score;

    if (mode === "semantic" && provider === "exa") score += 10;
    if (mode === "news" && (provider === "serper" || provider === "tavily")) score += 5;
    if (mode === "legal" && provider === "tavily") score += 5;

    return score;
  }

  private calculateFreshnessScore(result: NormalizedSearchResult): number {
    if (!result.publishedDate) return 50;

    const published = new Date(result.publishedDate).getTime();
    const now = Date.now();
    const daysOld = (now - published) / (1000 * 60 * 60 * 24);

    if (daysOld <= 1) return 100;
    if (daysOld <= 7) return 80;
    if (daysOld <= 30) return 60;
    if (daysOld <= 90) return 40;
    return 20;
  }

  private deduplicateResults(results: UnifiedSearchResult[]): UnifiedSearchResult[] {
    const seenUrls = new Set<string>();
    const deduplicated: UnifiedSearchResult[] = [];

    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.url);
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        deduplicated.push(result);
      }
    }

    return deduplicated;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      parsed.search = "";
      return parsed.hostname.replace(/^www\./, "") + parsed.pathname;
    } catch {
      return url;
    }
  }

  private async callWithRetry<T>(fn: () => Promise<T>, retries: number, backoffMs: number): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  getProviderCapabilities(): SearchCapabilityScore[] {
    return Object.values(this.providerCapabilities);
  }

  updateProviderCapability(provider: SearchOnlyProviderName, capability: Partial<SearchCapabilityScore>): void {
    if (this.providerCapabilities[provider]) {
      this.providerCapabilities[provider] = { ...this.providerCapabilities[provider], ...capability };
    }
  }
}

export const unifiedSearchRouter = new UnifiedSearchRouter();