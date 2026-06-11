import { redactSecretString } from "../../security/secret-redaction.js";
import { createSearchRuntimeMetadata, extractWithFallback } from "../../search/search-provider-router.js";
import type { ExtractionProviderName, ExtractorProviderName } from "../../search/search-provider-types.js";
import { canonicalizeUrl } from "../../evidence/source-normalizer.js";
import { enrichmentCacheKey } from "./enrichment-cache.js";
import { cleanExtractedText } from "./clean-text.js";
import { chunkCleanedText } from "./chunk-source.js";
import { computeCitationEligibility, extractionQualityFor } from "./source-quality.js";
import { emitEnrichmentEvent } from "./telemetry.js";
import { extractQueryTerms, scoreChunks } from "./local-relevance-scorer.js";
import { pruneInvalidEvidenceCardChunks, validateEvidenceCard } from "./evidence-card-validator.js";
import { localEvidenceReducer } from "./reducers/local-evidence-reducer.js";
import { cerebrasEvidenceReducer } from "./reducers/cerebras-evidence-reducer.js";
import { selectBackupSource, type ScoreableSource } from "./backup-source-selector.js";
import { isPdfUrl, extract as extractPdf } from "./extractors/pdf-extractor.js";
import { extract as extractWebpage, extractReadableArticleText, stripHtmlToText } from "./extractors/webpage-extractor.js";
import { EnrichmentIntegrityError, type EnrichedSource, type ExtractorResult, type SourceEnrichmentOptions } from "./types.js";
import { retrievalCacheManager } from "../../retrieval-cache/index.js";

type SourceInput = {
  title: string;
  url: string;
  domain: string;
  excerpt?: string;
  snippet?: string;
  sourceId?: number;
  bucketIds?: string[];
  foundByQuery?: string;
  foundByQueries?: string[];
  score?: number;
  authorityScore?: number;
};

const inFlightEnrichments = new Map<string, Promise<EnrichedSource>>();

export async function enrichSources<T extends SourceInput>(
  sources: T[],
  options: SourceEnrichmentOptions = {},
): Promise<EnrichedSource[]> {
  return enrichSourcesConcurrent(sources, options, options.concurrency ?? 5);
}

export async function enrichSourcesConcurrent<T extends SourceInput>(
  sources: T[],
  options: SourceEnrichmentOptions = {},
  concurrency = 5,
): Promise<EnrichedSource[]> {
  const results = new Array<EnrichedSource>(sources.length);
  const enrichedUrls = new Set<string>();
  const disabledExtractionProviders = options.disabledExtractionProviders ?? new Set<ExtractionProviderName>();
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, sources.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < sources.length) {
      if (options.abortSignal?.aborted) break;
      const index = cursor;
      cursor += 1;
      const source = sources[index];
      enrichedUrls.add(source.url);
      const runOptions = { ...options, disabledExtractionProviders };
      let enriched = await enrichSource(source, runOptions);
      if (enriched.extractionQuality === "low" && enriched.extractionMethod === "failed") {
        const backup = selectBackupSource(sources as ScoreableSource[], source.url, enrichedUrls);
        if (backup) {
          enrichedUrls.add(backup.url);
          emitEnrichmentEvent("enrichment.backup_substituted", { domain: enriched.domain, backup_domain: domainFromUrl(backup.url) });
          enriched = await enrichSource(backup as T, runOptions);
        }
      }
      results[index] = enriched;
    }
  }));
  return results;
}

export async function enrichSource<T extends SourceInput>(
  source: T,
  options: SourceEnrichmentOptions = {},
): Promise<EnrichedSource> {
  if (options.abortSignal?.aborted) {
    throw new Error("Enrichment aborted: budget exceeded");
  }
  assertSourceIdentity(source);
  const query = queryForSource(source, options);
  const inFlightKey = `${canonicalizeUrl(source.url)}::${query}`;
  const inFlight = inFlightEnrichments.get(inFlightKey);
  if (inFlight) return inFlight;

  const next = enrichSourceInternal(source, options, query).finally(() => {
    inFlightEnrichments.delete(inFlightKey);
  });
  inFlightEnrichments.set(inFlightKey, next);
  return next;
}

async function enrichSourceInternal<T extends SourceInput>(
  source: T,
  options: SourceEnrichmentOptions,
  query: string,
): Promise<EnrichedSource> {
  const cacheKey = enrichmentCacheKey(source.url, query);
  const retrievalProvider = preferredCacheProvider(source, options);
  let cachedExtraction: ReturnType<typeof retrievalCacheManager.getExtraction> = null;
  if (options.useCache) {
    try {
      cachedExtraction = retrievalCacheManager.getExtraction({
        url: source.url,
        provider: retrievalProvider,
        allowNegativeHit: true,
        emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}),
      });
    } catch (error) {
      const safe = redactSecretString(error instanceof Error ? error.message : String(error));
      options.onError?.(`${source.url}: retrieval cache read failed: ${safe}`);
      options.onCacheEvent?.("retrieval_cache_schema_mismatch", { url: source.url, provider: retrievalProvider });
    }
  }
  if (cachedExtraction) {
    if ("negative" in cachedExtraction) {
      return buildEnriched(source, fallbackExtraction(source, cachedExtraction.failureReason), options);
    }
    return cachedExtraction;
  }
  const cached = options.useCache && options.cache ? options.cache.get<unknown>("enrichment", cacheKey) : null;
  if (cached && isCachedEnrichedSource(cached)) {
    options.onCacheEvent?.("cache_hit", { url: source.url });
    retrievalCacheManager.writeExtraction({ url: source.url, provider: cached.extractionProvider ?? retrievalProvider, emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}) }, cached);
    return cached;
  }
  if (cached) options.onCacheEvent?.("retrieval_cache_schema_mismatch", { url: source.url, cacheLayer: "legacy_enrichment" });
  if (options.useCache && options.cache) options.onCacheEvent?.("cache_miss", { url: source.url });

  let extracted: ExtractorResult;
  try {
    extracted = await extractSource(source, options);
  } catch (error) {
    if (options.abortSignal?.aborted) throw new Error("Enrichment aborted: budget exceeded");
    const safe = redactSecretString(error instanceof Error ? error.message : String(error));
    options.onError?.(`${source.url}: ${safe}`);
    extracted = fallbackExtraction(source, safe);
  }

  const enriched = await buildEnriched(source, extracted, options);
  if (options.useCache) {
    if (enriched.extractionStatus === "failed") {
      retrievalCacheManager.writeNegativeExtraction({ url: source.url, provider: enriched.extractionProvider ?? retrievalProvider, emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}) }, { status: enriched.extractionStatus, error: enriched.enrichmentError });
    } else {
      retrievalCacheManager.writeExtraction({ url: source.url, provider: enriched.extractionProvider ?? retrievalProvider, emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}) }, enriched);
    }
  }
  return enriched;
}

function isCachedEnrichedSource(value: unknown): value is EnrichedSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<EnrichedSource>;
  return typeof source.title === "string"
    && typeof source.url === "string"
    && typeof source.domain === "string"
    && (typeof source.fullText === "string" || source.fullText === null)
    && typeof source.textLength === "number"
    && typeof source.extractionMethod === "string"
    && typeof source.extractionQuality === "string"
    && typeof source.citationEligible === "boolean";
}

export async function buildEnriched<T extends SourceInput>(
  source: T,
  extracted: ExtractorResult,
  options: SourceEnrichmentOptions = {},
): Promise<EnrichedSource> {
  const title = extracted.title?.trim() || source.title?.trim() || source.url;
  const url = extracted.url?.trim() || source.url;
  if (!url) throw new EnrichmentIntegrityError("Enrichment source URL is required");
  const rawText = firstNonEmpty(extracted.text, extracted.markdown, source.snippet ?? null);
  const query = queryForSource(source, options);
  const cleaned = cleanExtractedText(rawText ?? "");
  const method = extracted.extractionMethod;
  const extractionQuality = extractionQualityFor(cleaned, method);
  const chunks = chunkCleanedText(cleaned.text, query, url);
  const scoredChunks = scoreChunks(chunks, extractQueryTerms(query));
  const topChunks = scoredChunks.slice(0, method === "snippet_fallback" ? 3 : 8);
  const maxChars = method === "snippet_fallback" ? 4_000 : 6_000;
  const fullText = capText(topChunks.map((chunk) => chunk.text).join("\n\n"), maxChars) || null;
  const extractionStatus = extracted.extractionStatus ?? (fullText ? "success" : "failed");

  const provisional: EnrichedSource = {
    sourceId: source.sourceId,
    title,
    url,
    canonicalUrl: canonicalizeUrl(url),
    domain: source.domain || domainFromUrl(url),
    bucketIds: source.bucketIds,
    fullText,
    snippet: source.snippet ?? null,
    textLength: fullText?.length ?? 0,
    extractionMethod: method,
    extractionProvider: extracted.extractionProvider,
    extractionStatus,
    fallbackExtractionUsed: extracted.fallbackExtractionUsed || method === "snippet_fallback",
    extractionQuality,
    citationEligible: false,
    enrichmentError: redactSecretString(extracted.error ?? ""),
    sourceChunks: chunks,
  };

  const reducer = shouldUseCerebras(options) ? cerebrasEvidenceReducer : localEvidenceReducer;
  const card = await reducer.reduce(provisional, topChunks, query, options);
  const validation = validateEvidenceCard(card, chunks);
  const prunedCard = pruneInvalidEvidenceCardChunks(card, chunks);
  if (!validation.valid) {
    emitEnrichmentEvent("enrichment.card_validation_failed", { invalid: validation.invalidChunks.length });
  }
  const eligibility = extractionStatus === "partial"
    ? { citationEligible: false, citationStrength: "ineligible" as const }
    : computeCitationEligibility(prunedCard);
  const enrichmentCard = { ...prunedCard, ...eligibility };

  emitEnrichmentEvent("enrichment.extraction_method", { method });
  emitEnrichmentEvent("enrichment.quality", { quality: extractionQuality });

  return {
    ...provisional,
    enrichmentCard,
    citationEligible: enrichmentCard.citationEligible,
    citationStrength: enrichmentCard.citationStrength,
    limitedSource: enrichmentCard.limitedSource,
    keyTermsMatched: enrichmentCard.keyTermsMatched,
  };
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => Boolean(value?.trim())) ?? null;
}

async function extractSource<T extends SourceInput>(source: T, options: SourceEnrichmentOptions): Promise<ExtractorResult> {
  const preloadedText = source.excerpt && source.excerpt.length > 300 ? source.excerpt : null;
  if (preloadedText) {
    return {
      url: source.url,
      title: source.title,
      text: preloadedText,
      extractionMethod: "preloaded",
      extractionStatus: "success",
    };
  }

  let localAttempt: ExtractorResult | null = null;
  if (process.env.LOCAL_EXTRACTOR_FIRST !== "false") {
    localAttempt = await extractLocally(source, options).catch((error): ExtractorResult => ({
      url: source.url,
      title: source.title,
      text: null,
      extractionMethod: "failed",
      extractionStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    if (isUsableExtractorResult(localAttempt)) return localAttempt;
  }

  const hasExtractorKey = Boolean(
    options.firecrawlKey
    || options.jinaKey
    || options.scraperapiKey
    || options.zenrowsKey
    || options.scrapingbeeKey
    || options.geekflareKey,
  );
  if (hasExtractorKey) {
    const runtime = createSearchRuntimeMetadata();
    const extracted = await extractWithFallback(source.url, {
      keys: {
        firecrawl: options.firecrawlKey,
        jina: options.jinaKey,
        scraperapi: options.scraperapiKey,
        zenrows: options.zenrowsKey,
        scrapingbee: options.scrapingbeeKey,
        geekflare: options.geekflareKey,
      },
      fetchFn: options.fetchFn,
      timeoutMs: options.timeoutMs,
      snippet: source.snippet ?? null,
      runtime,
      abortSignal: options.abortSignal,
      disabledExtractionProviders: options.disabledExtractionProviders as Set<ExtractorProviderName> | undefined,
      extractionCooldown: options.extractionCooldown,
    });
    for (const failure of runtime.providerFailures ?? []) {
      const safe = redactSecretString(failure.error ?? "provider extraction failed");
      options.onError?.(`${source.url}: ${failure.provider} ${safe}`);
    }
    const text = extracted.markdown ?? extracted.text ?? extracted.excerpt ?? htmlToReadableText(extracted.html) ?? null;
    if (extracted.provider === "snippet_fallback" || !text?.trim()) {
      const local = localAttempt ?? await extractLocally(source, options);
      if (local.extractionStatus !== "failed" || !text?.trim()) {
        return local;
      }
    }
    const method = extracted.provider === "firecrawl"
      ? "readability_fetch"
      : extracted.provider === "jina"
        ? "jina_reader"
        : extracted.provider === "snippet_fallback"
          ? "snippet_fallback"
          : text
            ? "readability_fetch"
            : "failed";
    return {
      url: extracted.url || source.url,
      title: extracted.title ?? source.title,
      text,
      markdown: extracted.markdown ?? null,
      extractionMethod: method,
      extractionProvider: extracted.provider as ExtractionProviderName,
      extractionStatus: extracted.status,
      fallbackExtractionUsed: Boolean(extracted.metadata?.fallbackExtractionUsed) || extracted.provider === "snippet_fallback",
      error: extracted.error,
    };
  }

  return localAttempt ?? extractLocally(source, options);
}

function isUsableExtractorResult(result: ExtractorResult): boolean {
  const text = result.markdown ?? result.text ?? htmlToReadableText(result.html) ?? "";
  return result.extractionStatus === "success" && text.trim().length >= 300;
}

function htmlToReadableText(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  return extractReadableArticleText(html) ?? stripHtmlToText(html);
}

async function extractLocally<T extends SourceInput>(source: T, options: SourceEnrichmentOptions): Promise<ExtractorResult> {
  if (isPdfUrl(source.url)) {
    const pdf = await extractPdf(source.url, options);
    if (pdf.extractionStatus !== "failed" || !source.snippet) return pdf;
  }

  const webpage = await extractWebpage(source.url, options);
  if (webpage.extractionStatus === "failed" && /application\/pdf/i.test(webpage.contentType ?? "")) {
    const pdf = await extractPdf(source.url, options);
    if (pdf.extractionStatus !== "failed" || !source.snippet) return pdf;
  }
  return { ...webpage, title: webpage.title ?? source.title };
}

function preferredCacheProvider<T extends SourceInput>(source: T, options: SourceEnrichmentOptions): string {
  if (source.excerpt && source.excerpt.length > 300) return "preloaded";
  if (options.jinaKey) return "jina";
  if (options.firecrawlKey) return "firecrawl";
  if (options.scraperapiKey) return "scraperapi";
  if (options.zenrowsKey) return "zenrows";
  if (options.scrapingbeeKey) return "scrapingbee";
  if (options.geekflareKey) return "geekflare";
  return "local";
}

function fallbackExtraction<T extends SourceInput>(source: T, error: string): ExtractorResult {
  const text = source.snippet ?? null;
  return {
    url: source.url,
    title: source.title,
    text,
    extractionMethod: text ? "snippet_fallback" : "failed",
    extractionProvider: text ? "snippet_fallback" : undefined,
    extractionStatus: text ? "partial" : "failed",
    fallbackExtractionUsed: Boolean(text),
    error,
  };
}

function queryForSource(source: SourceInput, options: SourceEnrichmentOptions): string {
  return options.query?.trim()
    || source.foundByQuery?.trim()
    || source.foundByQueries?.find((query) => query.trim())?.trim()
    || `${source.title} ${source.snippet ?? ""}`.trim()
    || source.title
    || source.url;
}

function shouldUseCerebras(options: SourceEnrichmentOptions): boolean {
  return process.env.CEREBRAS_ENRICHMENT_ENABLED === "true" && Boolean(process.env.CEREBRAS_API_KEY) && !options.abortSignal?.aborted;
}

function assertSourceIdentity(source: SourceInput): void {
  if (!source.url?.trim()) throw new EnrichmentIntegrityError("Enrichment source URL is required");
  if (!source.title?.trim()) source.title = source.url;
}

function capText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
