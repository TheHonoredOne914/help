import { firecrawlExtractorProvider } from "./providers/firecrawl-extractor-provider.js";
import { geekflareExtractorProvider } from "./providers/geekflare-extractor-provider.js";
import { jinaExtractorProvider } from "./providers/jina-extractor-provider.js";
import { scraperapiExtractorProvider } from "./providers/scraperapi-extractor-provider.js";
import { scrapingbeeExtractorProvider } from "./providers/scrapingbee-extractor-provider.js";
import { zenrowsExtractorProvider } from "./providers/zenrows-extractor-provider.js";
import type {
  SearchProviderKeys,
  ExtractorProviderName,
  ExtractorProvider,
  ExtractedPageContent,
  ExtractionProviderName,
} from "./search-provider-types.js";

export interface UnifiedCrawlerOptions {
  keys: SearchProviderKeys;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  snippet?: string | null;
  maxConcurrency?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  onCrawlerError?: (error: CrawlerErrorRecord) => void;
  onExtractionLatency?: (latency: ExtractionLatencyRecord) => void;
}

export interface CrawlerErrorRecord {
  url: string;
  provider: ExtractorProviderName;
  error: string;
  timestamp: string;
}

export interface ExtractionLatencyRecord {
  provider: ExtractionProviderName;
  url: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface ExtractionCapabilityScore {
  provider: ExtractorProviderName;
  score: number;
  strengths: string[];
  weaknesses: string[];
}

export interface UnifiedExtractionResult extends ExtractedPageContent {
  capabilityScore: number;
  confidenceScore: number;
  provenance: ExtractionProvenance;
}

export interface ExtractionProvenance {
  primaryProvider: ExtractionProviderName;
  fallbackProviders: ExtractionProviderName[];
  attempts: number;
  totalLatencyMs: number;
  failedProviders: string[];
  retryCount: number;
  timestamp: string;
  partialExtraction: boolean;
}

const DEFAULT_EXTRACTION_CAPABILITIES: Record<ExtractorProviderName, ExtractionCapabilityScore> = {
  firecrawl: {
    provider: "firecrawl",
    score: 90,
    strengths: ["full page extraction", "JavaScript rendering", "high reliability"],
    weaknesses: ["rate limits", "slower"],
  },
  jina: {
    provider: "jina",
    score: 85,
    strengths: ["fast", "good summarization", "lightweight"],
    weaknesses: ["may miss dynamic content", "shorter extracts"],
  },
  scraperapi: {
    provider: "scraperapi",
    score: 78,
    strengths: ["proxy fetch", "JavaScript rendering", "fallback coverage"],
    weaknesses: ["raw HTML requires local extraction", "paid request"],
  },
  zenrows: {
    provider: "zenrows",
    score: 80,
    strengths: ["premium proxy support", "JavaScript rendering", "anti-bot bypass"],
    weaknesses: ["paid request", "optional provider", "may return empty for hostile pages"],
  },
  scrapingbee: {
    provider: "scrapingbee",
    score: 78,
    strengths: ["render_js", "country code targeting", "fallback coverage"],
    weaknesses: ["raw HTML requires local extraction", "paid request", "optional provider"],
  },
  geekflare: {
    provider: "geekflare",
    score: 70,
    strengths: ["markdown-friendly output", "render_js option"],
    weaknesses: ["endpoint unconfirmed (off by default)", "optional provider"],
  },
};

export class UnifiedCrawlerRouter {
  private extractors: Record<ExtractorProviderName, ExtractorProvider>;
  private extractionCapabilities: Record<ExtractorProviderName, ExtractionCapabilityScore>;

  constructor() {
    this.extractors = {
      firecrawl: firecrawlExtractorProvider,
      jina: jinaExtractorProvider,
      scraperapi: scraperapiExtractorProvider,
      zenrows: zenrowsExtractorProvider,
      scrapingbee: scrapingbeeExtractorProvider,
      geekflare: geekflareExtractorProvider,
    };
    this.extractionCapabilities = { ...DEFAULT_EXTRACTION_CAPABILITIES };
  }

  async extract(url: string, options: UnifiedCrawlerOptions): Promise<UnifiedExtractionResult> {
    const availableProviders = this.getConfiguredProviders(options.keys);
    const snippet = options.snippet;

    if (availableProviders.length === 0) {
      return this.createFallbackResult(url, snippet, "No extraction providers configured");
    }

    const prioritizedProviders = this.prioritizeProviders(availableProviders);
    const failedProviders: string[] = [];
    const fallbackProviders: ExtractionProviderName[] = [];
    let totalLatencyMs = 0;
    let retryCount = 0;

    for (const providerName of prioritizedProviders) {
      const extractor = this.extractors[providerName];
      const startTime = Date.now();

      try {
        const result = await this.callWithRetry(
          () => extractor.extract(url, options.keys, { fetchFn: options.fetchFn, timeoutMs: options.timeoutMs, snippet }),
          options.maxRetries ?? 2,
          options.retryBackoffMs ?? 500,
        );

        const latencyMs = Date.now() - startTime;
        totalLatencyMs += latencyMs;

        options.onExtractionLatency?.({
          provider: providerName,
          url,
          latencyMs,
          success: true,
        });

        const isPartial = result.status === "partial" || result.status === "failed";
        const capabilityScore = this.extractionCapabilities[providerName].score;

        return {
          ...result,
          capabilityScore,
          confidenceScore: this.calculateConfidenceScore(result, isPartial),
          provenance: {
            primaryProvider: providerName,
            fallbackProviders: [...fallbackProviders],
            attempts: fallbackProviders.length + 1,
            totalLatencyMs,
            failedProviders: [...failedProviders],
            retryCount,
            timestamp: new Date().toISOString(),
            partialExtraction: isPartial,
          },
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        failedProviders.push(providerName);
        fallbackProviders.push(providerName);
        retryCount += options.maxRetries ?? 2;

        options.onCrawlerError?.({
          url,
          provider: providerName,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });

        options.onExtractionLatency?.({
          provider: providerName,
          url,
          latencyMs,
          success: false,
          error: errorMessage,
        });
      }
    }

    return this.createFallbackResult(url, snippet, "All extraction providers failed");
  }

  async extractBatch(urls: string[], options: UnifiedCrawlerOptions): Promise<UnifiedExtractionResult[]> {
    const concurrency = Math.min(options.maxConcurrency ?? 5, urls.length);
    const results = new Array<UnifiedExtractionResult>(urls.length);
    let cursor = 0;

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (cursor < urls.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await this.extract(urls[index], options);
        }
      }),
    );

    return results;
  }

  private createFallbackResult(url: string, snippet: string | null | undefined, error: string): UnifiedExtractionResult {
    const text = snippet ?? undefined;
    return {
      url,
      provider: "snippet_fallback",
      excerpt: text,
      text,
      status: snippet ? "partial" : "failed",
      error,
      capabilityScore: 30,
      confidenceScore: snippet ? 40 : 10,
      provenance: {
        primaryProvider: "snippet_fallback",
        fallbackProviders: [],
        attempts: 1,
        totalLatencyMs: 0,
        failedProviders: [],
        retryCount: 0,
        timestamp: new Date().toISOString(),
        partialExtraction: Boolean(snippet),
      },
    };
  }

  private getConfiguredProviders(keys: SearchProviderKeys): ExtractorProviderName[] {
    return (Object.keys(this.extractors) as ExtractorProviderName[]).filter((name) => {
      const keyName = name as keyof SearchProviderKeys;
      return Boolean(keys[keyName]?.trim());
    });
  }

  private prioritizeProviders(providers: ExtractorProviderName[]): ExtractorProviderName[] {
    const scores = providers.map((provider) => ({
      provider,
      score: this.extractionCapabilities[provider].score,
    }));

    return scores.sort((a, b) => b.score - a.score).map((s) => s.provider);
  }

  private calculateConfidenceScore(result: ExtractedPageContent, isPartial: boolean): number {
    let score = 50;

    if (result.status === "success" && !isPartial) score += 40;
    if (result.status === "partial") score += 20;
    if (result.markdown && result.markdown.length > 1000) score += 10;
    if (result.text && result.text.length > 500) score += 5;
    if (result.error) score -= 20;

    return Math.min(100, Math.max(0, score));
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

  getExtractionCapabilities(): ExtractionCapabilityScore[] {
    return Object.values(this.extractionCapabilities);
  }

  updateExtractionCapability(provider: ExtractorProviderName, capability: Partial<ExtractionCapabilityScore>): void {
    if (this.extractionCapabilities[provider]) {
      this.extractionCapabilities[provider] = { ...this.extractionCapabilities[provider], ...capability };
    }
  }
}

export const unifiedCrawlerRouter = new UnifiedCrawlerRouter();
