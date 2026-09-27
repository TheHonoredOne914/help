import { redactSecretString } from "../../security/secret-redaction.js";
import { createSearchRuntimeMetadata, extractWithFallback } from "../../search/search-provider-router.js";
import type { ExtractionProviderName, ExtractorProviderName } from "../../search/search-provider-types.js";
import { canonicalizeUrl } from "../../evidence/source-normalizer.js";
import { cacheEnrichedSource, enrichmentCacheKey } from "./enrichment-cache.js";
import { cleanExtractedText } from "./clean-text.js";
import { chunkCleanedText } from "./chunk-source.js";
import { computeCitationEligibility, extractionQualityFor, isEvidenceShell } from "./source-quality.js";
import { emitEnrichmentEvent } from "./telemetry.js";
import { extractQueryTerms, filterChunksByBm25Floor, scoreChunks } from "./local-relevance-scorer.js";
import { pruneInvalidEvidenceCardChunks, validateEvidenceCard } from "./evidence-card-validator.js";
import { localEvidenceReducer } from "./reducers/local-evidence-reducer.js";
import { cerebrasEvidenceReducer } from "./reducers/cerebras-evidence-reducer.js";
import { selectBackupSource, type ScoreableSource } from "./backup-source-selector.js";
import { isPdfUrl, extract as extractPdf } from "./extractors/pdf-extractor.js";
import { extract as extractWebpage, extractBestMainContent } from "./extractors/webpage-extractor.js";
import {
  recoverLocalExtractionTier2,
  shouldAttemptTier2Recovery,
} from "./extractors/local-tier2-recovery.js";
import { EnrichmentIntegrityError, type EnrichedSource, type ExtractorResult, type SourceEnrichmentOptions } from "./types.js";
import { retrievalCacheManager } from "../../retrieval-cache/index.js";
import { shouldWriteNegativeExtraction } from "../../retrieval-cache/retrieval-cache-policy.js";
import { recordExtractionFailure, type ExtractionCooldownState } from "../../providers/limits/extraction-cooldown.js";
import { canonicalizeUrl as canonicalizeCacheUrl } from "../../retrieval-cache/retrieval-cache-key.js";

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
      enrichedUrls.add(canonicalizeUrl(source.url));
      const runOptions = { ...options, disabledExtractionProviders };
      let enriched = await enrichSource(source, runOptions);
      if (enriched.extractionQuality === "low" && enriched.extractionMethod === "failed") {
        const backup = selectBackupSource(sources as ScoreableSource[], source.url, enrichedUrls);
        if (backup && !backupUrlAlreadyPresent(backup.url, sources, enrichedUrls, results)) {
          enrichedUrls.add(backup.url);
          enrichedUrls.add(canonicalizeUrl(backup.url));
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
  if (options.abortSignal?.aborted) throwEnrichmentAbort(options.abortSignal);
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
      retrievalCacheManager.recordSchemaMismatch("url_extraction");
    }
  }
  if (cachedExtraction) {
    if ("negative" in cachedExtraction) {
      return buildEnriched(source, fallbackExtraction(source, cachedExtraction.failureReason), options);
    }
    // Snippet cache hits lock retries out of Jina/Firecrawl/wayback. High-value already
    // skipped; mid-tier media (toi/storyboard/nationalherald/…) dominated live 30/47 after
    // a 15m snippet write. Skip snippet_fallback reuse for every host.
    if (cachedExtraction.extractionMethod === "snippet_fallback") {
      options.onCacheEvent?.("cache_miss", { url: source.url, reason: "skip_snippet_fallback_hit" });
    } else {
      return cachedExtraction;
    }
  }
  const cached = options.useCache && options.cache ? options.cache.get<unknown>("enrichment", cacheKey) : null;
  if (cached && isCachedEnrichedSource(cached)) {
    if (cached.extractionMethod === "snippet_fallback") {
      options.onCacheEvent?.("cache_miss", { url: source.url, reason: "skip_snippet_fallback_hit" });
    } else {
      options.onCacheEvent?.("cache_hit", { url: source.url });
      retrievalCacheManager.writeExtraction({ url: source.url, provider: cached.extractionProvider ?? retrievalProvider, emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}) }, cached);
      return cached;
    }
  }
  if (cached) {
    options.onCacheEvent?.("retrieval_cache_schema_mismatch", { url: source.url, cacheLayer: "legacy_enrichment" });
    retrievalCacheManager.recordSchemaMismatch("url_extraction");
  }
  if (options.useCache && options.cache) options.onCacheEvent?.("cache_miss", { url: source.url });

  let extracted: ExtractorResult;
  try {
    extracted = await extractSource(source, options);
  } catch (error) {
    if (options.abortSignal?.aborted) throwEnrichmentAbort(options.abortSignal);
    const safe = redactSecretString(error instanceof Error ? error.message : String(error));
    options.onError?.(`${source.url}: ${safe}`);
    extracted = fallbackExtraction(source, safe);
  }

  const enriched = await buildEnriched(source, extracted, options);
  if (options.useCache) {
    if (enriched.extractionStatus === "failed" && !enriched.fallbackExtractionUsed && !source.snippet?.trim()) {
      const provider = enriched.extractionProvider ?? retrievalProvider;
      const failure = { status: enriched.extractionStatus, error: enriched.enrichmentError };
      const decision = shouldWriteNegativeExtraction({ ...failure, provider, fullChainFailed: true });
      const emit = (event: { type: string; data?: Record<string, unknown> }) => options.onCacheEvent?.(event.type, event.data ?? {});
      if (decision.write) {
        retrievalCacheManager.writeNegativeExtraction({ url: source.url, provider, emit, fullChainFailed: true }, failure);
      } else if (decision.routeToProviderHealth && options.extractionCooldown) {
        applyProviderHealthCooldown(options.extractionCooldown, provider, failure.error, source.url);
        retrievalCacheManager.persistExtractionCooldown(options.extractionCooldown, { emit });
      }
      // Do not cache empty/failed enrichments in the legacy CacheManager either.
    } else if (enriched.extractionStatus !== "failed" || enriched.fallbackExtractionUsed) {
      // Never persist snippet_fallback — it poisons top-up/re-enrich into a 15m dead end.
      if (enriched.extractionMethod === "snippet_fallback") {
        options.onCacheEvent?.("cache_skip", { url: source.url, reason: "skip_snippet_fallback_write" });
      } else {
        retrievalCacheManager.writeExtraction({ url: source.url, provider: enriched.extractionProvider ?? retrievalProvider, emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}) }, enriched);
        if (options.cache) {
          cacheEnrichedSource(options.cache, enriched, query);
        }
      }
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
  const scoredChunks = filterChunksByBm25Floor(scoreChunks(chunks, extractQueryTerms(query)));
  const topChunks = (scoredChunks.length ? scoredChunks : scoreChunks(chunks, extractQueryTerms(query)))
    .slice(0, method === "snippet_fallback" ? 3 : 8);
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
  // Partial/snippet extracts stay limited but may be weak-eligible via computeCitationEligibility.
  const eligibility = computeCitationEligibility({
    ...prunedCard,
    limitedSource: Boolean(prunedCard.limitedSource) || method === "snippet_fallback" || extractionStatus === "partial",
  });
  const enrichmentCard = {
    ...prunedCard,
    limitedSource: Boolean(prunedCard.limitedSource) || method === "snippet_fallback" || extractionStatus === "partial",
    ...eligibility,
  };

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

  const hasExtractorKey = Boolean(
    options.firecrawlKey
    || options.jinaKey
    || options.scraperapiKey
    || options.zenrowsKey
    || options.scrapingbeeKey
    || options.geekflareKey,
  );
  // When paid extractors will run next, skip headless/wayback on the first local pass.
  // Burning Tier-2 before Jina/Firecrawl exhausted the 72s fast enrichment budget and
  // forced mass snippet_fallback (live: wayback 0, snippet 30/47).
  let localAttempt: ExtractorResult | null = null;
  if (process.env.LOCAL_EXTRACTOR_FIRST !== "false") {
    localAttempt = await extractLocally(source, options, { deferTier2: hasExtractorKey }).catch((error): ExtractorResult => ({
      url: source.url,
      title: source.title,
      text: null,
      extractionMethod: "failed",
      extractionStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    if (isUsableExtractorResult(localAttempt)) return localAttempt;
  }

  const localUnusable = !localAttempt || !isUsableExtractorResult(localAttempt);
  if (hasExtractorKey && shouldCallPaidExtractors(source, options, localUnusable)) {
    const runtime = createSearchRuntimeMetadata();
    const highValue = isHighValueExtractionSource(source, options);
    // Mid-tier: Jina first; include Firecrawl key so extractWithFallback can escalate after
    // Jina miss/shell (router already sets escalateFirecrawl). Without the key, mid-tier
    // always collapsed to snippet_fallback even when FIRECRAWL_API_KEY was configured.
    const extracted = await extractWithFallback(source.url, {
      keys: highValue
        ? {
          firecrawl: options.firecrawlKey,
          jina: options.jinaKey,
          scraperapi: options.scraperapiKey,
          zenrows: options.zenrowsKey,
          scrapingbee: options.scrapingbeeKey,
          geekflare: options.geekflareKey,
        }
        : {
          jina: options.jinaKey,
          firecrawl: options.firecrawlKey,
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
      if (localAttempt && isUsableExtractorResult(localAttempt)) {
        return localAttempt;
      }
      const localPreferred = preferLocalExtractOverSnippet(localAttempt, source);
      if (localPreferred) return localPreferred;
      if (extracted.provider === "snippet_fallback" && text?.trim()) {
        const recovered = await recoverAfterPaidMiss(source, options, localAttempt, extracted.error);
        if (recovered) return recovered;
        // Mid-tier: longer SEO snippets previously beat short real local bodies and locked
        // extractionMethod=snippet_fallback (live 30/47). Keep partial local before fallthrough.
        const partialLocal = preferPartialLocalBody(localAttempt, source);
        if (partialLocal) return partialLocal;
        // fall through to map snippet_fallback below
      } else {
        const recovered = await recoverAfterPaidMiss(source, options, localAttempt, extracted.error);
        if (recovered) return recovered;
        const partialLocal = preferPartialLocalBody(localAttempt, source);
        if (partialLocal) return partialLocal;
        const snippeted = fallbackExtraction(source, extracted.error ?? localAttempt?.error ?? "extraction failed");
        if (snippeted.extractionMethod === "snippet_fallback") return snippeted;
        if (localAttempt && localAttempt.extractionStatus !== "failed") return localAttempt;
        return snippeted;
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
    const paidResult: ExtractorResult = {
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
    // Thin Jina/Firecrawl "success" still leaves unusable text; escalate Tier-2 (wayback)
    // before locking in a weak paid extract — for all hosts, not only high-value.
    if (!isUsableExtractorResult(paidResult)) {
      const recovered = await recoverAfterPaidMiss(source, options, localAttempt, extracted.error);
      if (recovered) return recovered;
      const localPreferred = preferLocalExtractOverSnippet(localAttempt, source);
      if (localPreferred) return localPreferred;
      const partialLocal = preferPartialLocalBody(localAttempt, source);
      if (partialLocal) return partialLocal;
    }
    // Never promote paid snippet_fallback over a real local body (snippet length ignored).
    if (paidResult.extractionMethod === "snippet_fallback" || paidResult.fallbackExtractionUsed) {
      const keepLocal = preferPartialLocalBody(localAttempt, source);
      if (keepLocal) return keepLocal;
    }
    return paidResult;
  }

  const local = localAttempt ?? await extractLocally(source, options);
  if (isUsableExtractorResult(local)) return local;
  // Deferred Tier-2 from the first local pass: run it now when paid extractors were skipped.
  if (hasExtractorKey && shouldAttemptTier2Recovery(local)) {
    const recovered = await recoverAfterPaidMiss(source, options, local, local.error);
    if (recovered) return recovered;
  }
  const localPreferred = preferLocalExtractOverSnippet(local, source);
  if (localPreferred) return localPreferred;
  const snippeted = fallbackExtraction(source, local.error ?? "local extraction failed");
  if (snippeted.extractionMethod === "snippet_fallback") return snippeted;
  return local;
}

function isUsableExtractorResult(result: ExtractorResult): boolean {
  // Search-snippet fallback is never "usable full text" — treating long snippets as success
  // skipped Tier-2 and locked live enrichments on snippet_fallback (30/47).
  if (result.extractionMethod === "snippet_fallback" || result.fallbackExtractionUsed) return false;
  const text = result.markdown ?? result.text ?? htmlToReadableText(result.html) ?? "";
  if (result.extractionStatus !== "success" || text.trim().length < 300) return false;
  if (isEvidenceShell(text)) return false;
  return true;
}

export function preferLocalExtractOverSnippet(
  local: ExtractorResult | null | undefined,
  source: SourceInput,
): ExtractorResult | null {
  if (!local) return null;
  const text = (local.markdown ?? local.text ?? htmlToReadableText(local.html) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 120) return null;
  if (isEvidenceShell(text)) return null;
  if (local.extractionStatus === "failed") return null;
  const snippetLen = (source.snippet ?? "").trim().length;
  // High-value hosts (eci/pib/…): search snippets are often longer SEO fluff than a short
  // but real local body. Preferring the snippet locked those pages into snippet_fallback.
  if (text.length <= snippetLen && !isHighValueExtractionSource(source)) return null;
  return {
    ...local,
    text,
    title: local.title ?? source.title,
    extractionStatus: text.length >= 300 ? "success" : "partial",
    fallbackExtractionUsed: false,
    error: undefined,
  };
}

/**
 * After paid extractors collapse to snippet_fallback, keep a real local body even when the
 * search snippet is longer. Unlike preferLocalExtractOverSnippet, snippet length is ignored
 * so mid-tier hosts are not stuck on SEO fluff (live: snippet_fallback 30/47).
 */
export function preferPartialLocalBody(
  local: ExtractorResult | null | undefined,
  source: SourceInput,
): ExtractorResult | null {
  if (!local || local.extractionStatus === "failed") return null;
  if (local.extractionMethod === "snippet_fallback" || local.fallbackExtractionUsed) return null;
  const text = (local.markdown ?? local.text ?? htmlToReadableText(local.html) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 120 || isEvidenceShell(text)) return null;
  return {
    ...local,
    text,
    title: local.title ?? source.title,
    extractionStatus: text.length >= 300 ? "success" : "partial",
    fallbackExtractionUsed: false,
    error: undefined,
  };
}

function htmlToReadableText(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  return extractBestMainContent(html);
}

async function recoverAfterPaidMiss<T extends SourceInput>(
  source: T,
  options: SourceEnrichmentOptions,
  localAttempt: ExtractorResult | null,
  paidError?: string,
): Promise<ExtractorResult | null> {
  const prior: ExtractorResult = localAttempt ?? {
    url: source.url,
    title: source.title,
    text: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: paidError ?? "paid extractors returned unusable text",
  };
  // Fresh Tier-2 (headless/wayback) after paid miss — deferred from the first local pass
  // so enrichment budget is not spent on archive fetches before Jina/Firecrawl.
  const seed: ExtractorResult = {
    url: source.url,
    title: source.title,
    text: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: paidError ?? prior.error ?? "paid extractors returned unusable text",
  };
  const recovered = await recoverLocalExtractionTier2(
    source.url,
    seed,
    {
      fetchFn: options.fetchFn,
      timeoutMs: options.timeoutMs,
      abortSignal: options.abortSignal,
      renderHtml: options.tier2Overrides?.renderHtml,
      launchBrowser: options.tier2Overrides?.launchBrowser as any,
    },
    options.tier2Overrides,
  );
  if (isUsableExtractorResult(recovered)) return recovered;
  return preferLocalExtractOverSnippet(recovered, source)
    ?? preferPartialLocalBody(recovered, source)
    ?? preferPartialLocalBody(localAttempt, source);
}

async function extractLocally<T extends SourceInput>(
  source: T,
  options: SourceEnrichmentOptions,
  localOpts: { deferTier2?: boolean } = {},
): Promise<ExtractorResult> {
  if (isPdfUrl(source.url)) {
    const pdf = await extractPdf(source.url, options);
    // Keep snippet-gated fallthrough so a failed pdfjs pass can still try content-type
    // recovery / paid path without forcing every miss to burn the full PDF download budget.
    if (pdf.extractionStatus !== "failed" || !source.snippet) return pdf;
  }

  const webpage = await extractWebpage(source.url, options);
  if (webpage.extractionStatus === "failed" && /application\/pdf/i.test(webpage.contentType ?? "")) {
    const pdf = await extractPdf(source.url, options);
    if (pdf.extractionStatus !== "failed" || !source.snippet) return pdf;
  }

  let best: ExtractorResult = { ...webpage, title: webpage.title ?? source.title };
  if (!localOpts.deferTier2 && shouldAttemptTier2Recovery(best)) {
    best = await recoverLocalExtractionTier2(
      source.url,
      best,
      {
        fetchFn: options.fetchFn,
        timeoutMs: options.timeoutMs,
        abortSignal: options.abortSignal,
        renderHtml: options.tier2Overrides?.renderHtml,
        launchBrowser: options.tier2Overrides?.launchBrowser as any,
      },
      options.tier2Overrides,
    );
    if (!best.title) best = { ...best, title: source.title };
  }
  return best;
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


export type ExtractionApiMode = "never" | "high_value_only" | "always";

export function getExtractionApiMode(env: NodeJS.ProcessEnv = process.env): ExtractionApiMode {
  const raw = String(env.EXTRACTION_API_MODE ?? "high_value_only").trim().toLowerCase();
  if (raw === "never" || raw === "always" || raw === "high_value_only") return raw;
  return "high_value_only";
}

// Gov/court plus major Indian publishers that dominate fast_research corpora.
// Local fetch often fails on these hosts; without API recovery they land as
// snippet_fallback and trip source_quality (snippet ratio).
// adrindia/scobserver/livelaw/casemine/lawtrend: electoral/legal research hosts that
// repeatedly dominate live snippet_fallback when treated as mid-tier only.
const HIGH_VALUE_DOMAIN_RE = /\.gov\.in|sansad|pib|indiankanoon|sci\.gov\.in|eci|prsindia|adrindia|scobserver|livelaw|casemine|lawtrend|thehindu|indianexpress|livemint|hindustantimes|ndtv|theprint|scroll\.in|economictimes|business-standard|indiatoday|news18|thewire\.in|caravanmagazine/i;

export function isHighValueExtractionSource(source: SourceInput, options: SourceEnrichmentOptions = {}): boolean {
  if (options.forceApiExtraction) return true;
  if ((source.authorityScore ?? 0) >= 55) return true;
  const domain = (source.domain || domainFromUrl(source.url)).toLowerCase();
  return HIGH_VALUE_DOMAIN_RE.test(domain);
}

export function shouldCallPaidExtractors(
  source: SourceInput,
  options: SourceEnrichmentOptions,
  localUnusable: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const mode = getExtractionApiMode(env);
  if (mode === "never") return false;
  if (mode === "always") return true;
  if (!localUnusable) return false;
  if (isHighValueExtractionSource(source, options)) return true;
  // Mid-tier pages: allow cheap Jina recovery when a key is present (Firecrawl stripped at call site).
  return Boolean(options.jinaKey?.trim());
}

function shouldUseCerebras(options: SourceEnrichmentOptions): boolean {
  // Double gate: stays off unless BOTH env flags are explicitly true.
  return process.env.CEREBRAS_ENRICHMENT_ENABLED === "true"
    && process.env.ALLOW_CEREBRAS_ENRICHMENT === "true"
    && Boolean(process.env.CEREBRAS_API_KEY)
    && !options.abortSignal?.aborted;
}

function assertSourceIdentity(source: SourceInput): void {
  if (!source.url?.trim()) throw new EnrichmentIntegrityError("Enrichment source URL is required");
  if (!source.title?.trim()) source.title = source.url;
}

function capText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
}

function throwEnrichmentAbort(signal: AbortSignal): never {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message.includes("budget exceeded")) throw reason;
  if (reason instanceof Error) throw reason;
  throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}

function backupUrlAlreadyPresent(
  backupUrl: string,
  batch: Array<{ url: string }>,
  occupied: Set<string>,
  written: Array<{ url: string } | undefined>,
): boolean {
  const key = canonicalizeUrl(backupUrl);
  const matches = (url: string) => url === backupUrl || canonicalizeUrl(url) === key;
  if ([...occupied].some(matches)) return true;
  if (written.some((row) => row && matches(row.url))) return true;
  return batch.some((candidate) => matches(candidate.url));
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function applyProviderHealthCooldown(
  state: ExtractionCooldownState,
  provider: string,
  error: string | undefined,
  url: string,
): void {
  const normalized = provider.toLowerCase();
  if (normalized !== "jina" && normalized !== "firecrawl") return;
  const statusMatch = error?.match(/\b([45]\d\d)\b/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : undefined;
  recordExtractionFailure(state, normalized, statusCode, canonicalizeCacheUrl(url));
}
