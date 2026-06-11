import type { CacheManager } from "../../../services/cache-manager.js";
import type { ExtractionProviderName } from "../../search/search-provider-types.js";
import type { ExtractionCooldownState } from "../../providers/limits/extraction-cooldown.js";

export interface EnrichmentEvidenceItem {
  claim: string;
  snippet: string;
  relevance: string;
}

export interface EnrichmentEvidenceCard {
  sourceId: number;
  url: string;
  title: string;
  topChunks: string[];
  evidenceItems?: EnrichmentEvidenceItem[];
  citationEligible: boolean;
  limitedSource: boolean;
  relevanceScore: number;
  extractionQuality: "high" | "medium" | "low";
  keyTermsMatched: string[];
  citationStrength: "strong" | "medium" | "weak" | "ineligible";
  reducerName?: "local" | "cerebras";
}

export interface EnrichedSource {
  sourceId?: number;
  title: string;
  url: string;
  canonicalUrl?: string;
  domain: string;
  bucketIds?: string[];
  fullText: string | null;
  snippet?: string | null;
  textLength: number;
  extractionMethod: "preloaded" | "jina_reader" | "readability_fetch" | "snippet_fallback" | "failed";
  extractionProvider?: ExtractionProviderName;
  extractionStatus?: "success" | "partial" | "failed";
  fallbackExtractionUsed?: boolean;
  extractionQuality: "high" | "medium" | "low";
  citationEligible: boolean;
  enrichmentError?: string;
  enrichmentCard?: EnrichmentEvidenceCard;
  sourceChunks?: SourceChunk[];
  citationStrength?: "strong" | "medium" | "weak" | "ineligible";
  limitedSource?: boolean;
  keyTermsMatched?: string[];
}

export interface SourceEnrichmentOptions {
  jinaKey?: string;
  firecrawlKey?: string;
  scraperapiKey?: string;
  zenrowsKey?: string;
  scrapingbeeKey?: string;
  geekflareKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  useCache?: boolean;
  cache?: CacheManager;
  concurrency?: number;
  query?: string;
  onError?: (error: string) => void;
  onCacheEvent?: (event: string, data: Record<string, unknown>) => void;
  abortSignal?: AbortSignal;
  disabledExtractionProviders?: Set<ExtractionProviderName>;
  extractionCooldown?: ExtractionCooldownState;
}

export interface SourceChunk {
  index: number;
  text: string;
  charLength: number;
  url?: string;
}

export interface ScoredChunk extends SourceChunk {
  relevanceScore: number;
  keyTermsMatched?: string[];
}

export interface CleanedText {
  text: string;
  boilerplateRatio: number;
  wordCount: number;
  uniqueWordRatio: number;
}

export interface ValidationResult {
  valid: boolean;
  invalidChunks: number[];
  verifiedChunks: number[];
}

export interface CacheTTLPolicy {
  status: "success" | "partial" | "failed" | "snippet_fallback";
  write: boolean;
  ttlMs?: number;
  freshness?: "fresh" | "semi_static" | "static";
}

export interface ExtractorOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  jinaKey?: string;
  firecrawlKey?: string;
  snippet?: string | null;
}

export interface ExtractorResult {
  url: string;
  title?: string;
  text: string | null;
  html?: string | null;
  markdown?: string | null;
  extractionMethod: EnrichedSource["extractionMethod"];
  extractionProvider?: ExtractionProviderName;
  extractionStatus: EnrichedSource["extractionStatus"];
  fallbackExtractionUsed?: boolean;
  error?: string;
  contentType?: string | null;
}

export interface ReducerOptions {
  fetchFn?: typeof fetch;
  abortSignal?: AbortSignal;
  cerebrasEnabled?: boolean;
  cerebrasApiKey?: string | null;
  cerebrasModel?: string;
  cerebrasMaxConcurrent?: number;
  cerebrasMaxTokensPerSource?: number;
  cerebrasMaxChunksPerSource?: number;
  cerebrasMaxCardsPerSource?: number;
  cerebrasRetryDelayMs?: number;
}

export interface EvidenceReducer {
  name: "local" | "cerebras";
  reduce(
    source: EnrichedSource,
    topChunks: ScoredChunk[],
    query: string,
    options: ReducerOptions,
  ): Promise<EnrichmentEvidenceCard>;
}

export class EnrichmentIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentIntegrityError";
  }
}
