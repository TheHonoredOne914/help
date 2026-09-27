import { RESEARCH_LIMITS, type ResearchMode } from "../config/research-mode.js";
import { canonicalizeUrl, type SourceClass } from "../evidence/evidence-registry.js";
import { normalizeEvidenceSourceInput } from "../evidence/source-normalizer.js";
import type { AgendaContract } from "../agenda/agenda-contract.js";
import { dedupeByContentSimilarity, dedupeSourcesByCanonicalUrl } from "./source-deduper.js";
import { enrichSources, enrichSource, buildEnriched, type EnrichedSource, type SourceEnrichmentOptions } from "./source-enrichment.js";
import { filterSourcesForAgenda } from "./source-filter.js";
import { scoreSourceForAgenda } from "./source-scoring.js";
import { RetrievalError, runSearchPlan, type RawSearchResult, type SearchExecutionOptions } from "./search-executor.js";
import type { BucketedQueryPlan } from "./query-planner.js";
import { logger } from "../../lib/logger.js";
import { multiKeyFetch } from "../../lib/multi-key-fetch.js";
import type { SourceBucketId } from "./source-buckets.js";
import { buildMultiHopExpansion, hopBatchNovelty, multiHopCap, orderedMultiHopQueries, shouldStopOnLowNovelty } from "./multi-hop-expander.js";
import { computeEvidenceScore, shouldStopRetrievalEarly } from "./early-stopping.js";
import { buildTopicAwareTopUpQuery } from "./query-planning/top-up-query-builder.js";
import { createExtractionCooldown } from "../providers/limits/extraction-cooldown.js";
import { retrievalCacheManager } from "../retrieval-cache/index.js";
import { shortHash } from "../retrieval-cache/retrieval-cache-key.js";
import { redactSecretString } from "../security/secret-redaction.js";
import type { ResearchAngle } from "../archive/research-angle-engine.js";

export interface BucketCoverageItem {
  bucketId: SourceBucketId;
  raw: number;
  kept: number;
  enriched: number;
}

export interface SourceGapReportCore {
  requiredUniqueSources: number;
  availableCitationEligibleSources: number;
  failedBuckets: SourceBucketId[];
  weakBuckets: SourceBucketId[];
  attemptedQueries: string[];
  providerErrors: string[];
  enrichmentFailures: string[];
  filterRejections: Array<{ reason: string; detail: string; title?: string; url?: string }>;
  explanation: string;
  repairAttempted: boolean;
}

export interface RetrievalSource extends RawSearchResult {
  canonicalUrl?: string;
  bucketIds: SourceBucketId[];
  foundByQueries: string[];
  score: number;
  sourceClass: SourceClass;
  scoreReasons: string[];
  fullText?: string | null;
  textLength?: number;
  extractionQuality?: "full" | "partial" | "snippet" | "failed";
  extractionProvider?: string;
  extractionStatus?: "success" | "partial" | "failed";
  fallbackExtractionUsed?: boolean;
  discoveredBy?: string[];
  citationEligible?: boolean;
  limitations?: string[];
  /** Preserved from enrichSource so registry/generation keep real chunks (live: 45/45 empty topChunks). */
  enrichmentCard?: EnrichedSource["enrichmentCard"];
  sourceChunks?: EnrichedSource["sourceChunks"];
  limitedSource?: boolean;
  citationStrength?: EnrichedSource["citationStrength"];
}

export interface BucketedRetrievalResult {
  rawResults: RawSearchResult[];
  dedupedResults: RetrievalSource[];
  filteredResults: RetrievalSource[];
  enrichedResults: RetrievalSource[];
  bucketCoverage: BucketCoverageItem[];
  failedBuckets: SourceBucketId[];
  weakBuckets: SourceBucketId[];
  providerErrors: string[];
  enrichmentFailures: string[];
  topUpAttempts: Array<{ bucketId: SourceBucketId; query: string; results: number }>;
  sourceGaps: string[];
  sourceGapReport: SourceGapReportCore | null;
  citationEligibleEstimate: number;
}

export interface BucketedRetrievalOptions extends SearchExecutionOptions {
  mode?: ResearchMode;
  maxRawResults?: number;
  maxSourcesToEnrich?: number;
  minCitationEligibleSources?: number;
  minFinalUniqueCitedSources?: number;
  enrichFetchFn?: typeof fetch;
  extractionTimeoutMs?: number;
  enrichmentBudgetMs?: number;
  researchAngles?: ResearchAngle[];
  emit?: (event: { type: string; data?: Record<string, unknown> }) => void;
}

export function modeRetrievalOptions(mode: ResearchMode): Required<Pick<BucketedRetrievalOptions, "maxRawResults" | "maxSourcesToEnrich" | "minCitationEligibleSources" | "minFinalUniqueCitedSources" | "maxConcurrency">> {
  const limits = RESEARCH_LIMITS[mode];
  return {
    maxRawResults: limits.maxRawResults,
    maxSourcesToEnrich: limits.maxSourcesToEnrich,
    minCitationEligibleSources: limits.minCitationEligibleSources,
    minFinalUniqueCitedSources: limits.minFinalUniqueCitedSources,
    maxConcurrency: limits.providerConcurrency,
  };
}

export async function runBucketedRetrieval(plan: BucketedQueryPlan, options: BucketedRetrievalOptions = {}): Promise<BucketedRetrievalResult> {
  const modeDefaults = modeRetrievalOptions(options.mode ?? "deep_research");
  const mergedOptions = { ...modeDefaults, enrichFetchFn: multiKeyFetch, ...options };
  const providerErrors: string[] = [];
  const enrichmentFailures: string[] = [];
  const cacheEvent = (event: string, data: Record<string, unknown>) => mergedOptions.emit?.({ type: event, data });

  mergedOptions.emit?.({ type: "bucket_search_started", data: { queries: plan.queries.length, live: Boolean(mergedOptions.live) } });

  let rawResults: RawSearchResult[] = [];
  let retrievalFailed = false;
  let retrievalFailureReason: string | undefined;

  try {
    rawResults = (await runSearchPlan(plan, {
      ...mergedOptions,
      maxConcurrency: mergedOptions.maxConcurrency,
      onProviderError: (error) => {
        providerErrors.push(error);
        mergedOptions.onProviderError?.(error);
      },
      onCacheEvent: cacheEvent,
    })).slice(0, mergedOptions.maxRawResults);
  } catch (error) {
    retrievalFailed = true;
    if (error instanceof RetrievalError) {
      retrievalFailureReason = error.message;
      providerErrors.push(...error.providerFailures);
    } else {
      retrievalFailureReason = error instanceof Error ? error.message : String(error);
      providerErrors.push(retrievalFailureReason);
    }
    mergedOptions.emit?.({ type: "bucket_search_failed", data: { reason: retrievalFailureReason, providerErrors } });
  }

  const sourceCountsByProvider = countBy(rawResults.map((source) => source.provider));
  mergedOptions.emit?.({ type: "bucket_search_completed", data: { rawResults: rawResults.length, providerErrors: providerErrors.length, searchProvidersUsed: Object.keys(sourceCountsByProvider), sourceCountsByProvider } });

  const scoredRaw = scoreAndShape(rawResults, plan);
  const dedupedResults = dedupeByContentSimilarity(dedupeSourcesByCanonicalUrl(scoredRaw));
  mergedOptions.emit?.({ type: "source_dedup_completed", data: { input: rawResults.length, kept: dedupedResults.length } });

  const initialFilter = filterSourcesForAgenda(dedupedResults, plan.agendaContract, { withReasons: true });
  // Spend enrichment budget on highest-agenda-score candidates first.
  const filteredResults = [...initialFilter.kept].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  const filterRejections = initialFilter.rejected.map((item) => ({
    reason: item.reason,
    detail: item.detail,
    title: item.source.title,
    url: item.source.url,
  }));
  mergedOptions.emit?.({ type: "source_filter_completed", data: { input: dedupedResults.length, kept: filteredResults.length, rejected: filterRejections.length } });
  mergedOptions.emit?.({ type: "source_scoring_completed", data: { scored: filteredResults.length } });

  let topUpAttempts: BucketedRetrievalResult["topUpAttempts"] = [];
  const initialCoverage = coverageFor(plan, rawResults, filteredResults, []);
  const weakForTopup = bucketsNeedingTopup(plan, initialCoverage, filteredResults.length, mergedOptions.minCitationEligibleSources);
  const mode = mergedOptions.mode ?? "deep_research";
  const evidenceSources = filteredResults.map((source) => ({
    bucketIds: source.bucketIds,
    extractionQuality: source.extractionQuality,
    citationEligible: source.citationEligible,
  }));
  const evidenceScore = computeEvidenceScore(evidenceSources, { targetScore: mergedOptions.minCitationEligibleSources });
  const earlyStop = shouldStopRetrievalEarly({
    mode,
    evidenceScore,
    evidenceSources,
    coveredBucketIds: [...new Set(filteredResults.flatMap((source) => source.bucketIds))],
    finalCitationsRealistic: evidenceScore >= mergedOptions.minFinalUniqueCitedSources
      || filteredResults.filter((source) => source.citationEligible).length >= mergedOptions.minFinalUniqueCitedSources,
    criticalMissingBucketIds: plan.agendaContract.requiredSourceBuckets
      .map((bucket) => bucket.bucketId)
      .filter((bucketId) => initialCoverage.some((coverage) => coverage.bucketId === bucketId && coverage.kept === 0)),
  });
  if (earlyStop.stop) mergedOptions.emit?.({ type: "latency_early_stop", data: { reason: earlyStop.reason, evidenceScore } });

  const enrichmentBudgetMs = mergedOptions.enrichmentBudgetMs
    ?? readPositiveIntegerEnv("RESEARCH_ENRICHMENT_BUDGET_MS")
    ?? RESEARCH_LIMITS[mergedOptions.mode ?? "deep_research"].enrichmentBudgetMs;
  const bucketsById = new Map(plan.buckets.map((bucket) => [bucket.id, bucket]));
  // P1-5: start enriching top-scored URLs while top-up / multi-hop continue.
  const earlyEnrichTargets = filteredResults.slice(0, mergedOptions.maxSourcesToEnrich);
  const enrichAbort = new AbortController();
  const abortEnrichOnParent = () => enrichAbort.abort();
  if (mergedOptions.abortSignal?.aborted) enrichAbort.abort();
  mergedOptions.abortSignal?.addEventListener("abort", abortEnrichOnParent, { once: true });
  let earlyEnrichPromise: Promise<{ enrichedBase: EnrichedSource[]; results: RetrievalSource[] }> | null = null;
  if (!earlyStop.stop && earlyEnrichTargets.length > 0) {
    mergedOptions.emit?.({ type: "source_enrichment_started", data: { total: earlyEnrichTargets.length, overlapped: true } });
    earlyEnrichPromise = enrichRetrievalBatch({
      sources: earlyEnrichTargets,
      mergedOptions: { ...mergedOptions, abortSignal: enrichAbort.signal },
      cacheEvent,
      enrichmentFailures,
      enrichmentBudgetMs,
      bucketsById,
    });
  }

  // Top-up when required buckets are weak — not solely on raw aggregate count.
  const shouldTopUp = !earlyStop.stop
    && !retrievalFailed
    && weakForTopup.length > 0
    && plan.topUpPolicy.weakBucketTopUp;
  if (shouldTopUp) {
    mergedOptions.emit?.({ type: "bucket_topup_started", data: { buckets: weakForTopup } });
    const topupPlan = {
      ...plan,
      queries: weakForTopup.map((bucketId, index) => ({
        id: `${bucketId}_live_topup_${index + 1}`,
        bucketId,
        query: buildContextualTopUpQuery(bucketId, plan.agendaContract, filteredResults),
        priority: "top_up" as const,
        expectedDomains: plan.buckets.find((bucket) => bucket.id === bucketId)?.preferredDomains ?? [],
        maxResultsPerQuery: mergedOptions.maxResultsPerQuery ?? 5,
        timeoutMs: mergedOptions.timeoutMs ?? 12000,
      })),
    };
    const topupRaw = await runSearchPlan(topupPlan, {
      ...mergedOptions,
      onProviderError: (error) => providerErrors.push(error),
      onCacheEvent: cacheEvent,
    });
    topUpAttempts = topupPlan.queries.map((query) => ({ bucketId: query.bucketId, query: query.query, results: topupRaw.filter((result) => result.bucketId === query.bucketId).length }));
    rawResults.push(...topupRaw);
  }

  // Multi-hop: case/entity → contrarian → index; caps deep=10 / council=25; novelty gate.
  const expansionModes: ResearchMode[] = ["deep_research", "council"];
  if (!earlyStop.stop && !retrievalFailed && expansionModes.includes(mergedOptions.mode ?? "deep_research")) {
    const expansion = buildMultiHopExpansion({
      round1Results: filteredResults,
      agendaContract: plan.agendaContract,
      weakBuckets: weakForTopup,
      researchAngles: mergedOptions.researchAngles ?? [],
      mode: mergedOptions.mode,
    });
    const expansionCap = multiHopCap(mergedOptions.mode);
    const expansionQueries = orderedMultiHopQueries(expansion, expansionCap);
    if (expansionQueries.length > 0) {
      mergedOptions.emit?.({ type: "multi_hop_expansion_started", data: { queries: expansionQueries.length } });
      const batchSize = Math.max(2, Math.ceil(expansionQueries.length / 3));
      const noveltyWindow: number[] = [];
      let priorForNovelty = [...filteredResults];
      let ranQueries = 0;
      for (let offset = 0; offset < expansionQueries.length; offset += batchSize) {
        const batch = expansionQueries.slice(offset, offset + batchSize);
        const expansionRaw = await runSearchPlan({ ...plan, queries: batch }, {
          ...mergedOptions,
          onProviderError: (error) => providerErrors.push(error),
          onCacheEvent: cacheEvent,
        });
        rawResults.push(...expansionRaw);
        ranQueries += batch.length;
        const batchShaped = scoreAndShape(expansionRaw, plan);
        const novelty = hopBatchNovelty(priorForNovelty, batchShaped);
        noveltyWindow.push(novelty);
        priorForNovelty = dedupeSourcesByCanonicalUrl([...priorForNovelty, ...batchShaped]);
        if (shouldStopOnLowNovelty(noveltyWindow)) {
          mergedOptions.emit?.({ type: "multi_hop_novelty_stop", data: { noveltyWindow, ranQueries } });
          break;
        }
        // Mid-flight early-stop: cancel pending enrich if score target hit.
        const midScore = computeEvidenceScore(
          priorForNovelty.map((source) => ({
            bucketIds: source.bucketIds,
            extractionQuality: source.extractionQuality,
            citationEligible: source.citationEligible,
          })),
          { targetScore: mergedOptions.minCitationEligibleSources },
        );
        if (midScore >= mergedOptions.minFinalUniqueCitedSources) {
          enrichAbort.abort();
          mergedOptions.emit?.({ type: "latency_early_stop", data: { reason: "multi_hop_score_met", evidenceScore: midScore } });
          break;
        }
      }
      mergedOptions.emit?.({ type: "multi_hop_expansion_completed", data: { queries: ranQueries, rawResults: rawResults.length } });
    }
  }

  let rescored = scoreAndShape(rawResults, plan);
  let rededuped = dedupeByContentSimilarity(dedupeSourcesByCanonicalUrl(rescored));
  let finalFilter = filterSourcesForAgenda(rededuped, plan.agendaContract, { withReasons: true });
  let refiltered = finalFilter.kept;
  let finalFilterRejections = finalFilter.rejected.map((item) => ({
    reason: item.reason,
    detail: item.detail,
    title: item.source.title,
    url: item.source.url,
  }));

  let earlyEnrichment: { enrichedBase: EnrichedSource[]; results: RetrievalSource[] } = {
    enrichedBase: [],
    results: [],
  };
  if (earlyEnrichPromise) {
    try {
      earlyEnrichment = await earlyEnrichPromise;
    } catch (error) {
      // Abort must stop the run. Any other throw keeps search rows already in hand
      // instead of replacing the retrieval with an empty source list.
      if (isAbortError(error) || mergedOptions.abortSignal?.aborted) throw error;
      if (rawResults.length > 0 || refiltered.length > 0) {
        earlyEnrichment = { enrichedBase: [], results: [] };
      } else {
        throw error;
      }
    }
  }
  mergedOptions.abortSignal?.removeEventListener("abort", abortEnrichOnParent);

  const enrichedByUrl = new Map(earlyEnrichment.results.map((source) => [enrichedMergeKey(source), source]));
  const toEnrichExtra = refiltered
    .filter((source) => !enrichedByUrl.has(enrichedMergeKey(source)))
    .slice(0, Math.max(0, mergedOptions.maxSourcesToEnrich - enrichedByUrl.size));
  if (!earlyEnrichPromise && refiltered.length > 0) {
    mergedOptions.emit?.({ type: "source_enrichment_started", data: { total: refiltered.slice(0, mergedOptions.maxSourcesToEnrich).length } });
  }
  const extraEnrichment = toEnrichExtra.length > 0
    ? await enrichRetrievalBatch({
      sources: toEnrichExtra,
      mergedOptions,
      cacheEvent,
      enrichmentFailures,
      enrichmentBudgetMs,
      bucketsById,
    })
    : { enrichedBase: [] as EnrichedSource[], results: [] as RetrievalSource[] };

  // Merge: prefer enriched versions; skip re-enrich.
  const mergedEnriched = new Map<string, RetrievalSource>();
  for (const source of [...earlyEnrichment.results, ...extraEnrichment.results]) {
    mergedEnriched.set(enrichedMergeKey(source), source);
  }
  let enrichedResults = refiltered
    .slice(0, mergedOptions.maxSourcesToEnrich)
    .map((source) => mergedEnriched.get(enrichedMergeKey(source)) ?? source);
  let enrichedBase = [...earlyEnrichment.enrichedBase, ...extraEnrichment.enrichedBase];
  let extractionProviderBreakdown = countBy(enrichedBase.map((source) => source.extractionProvider ?? source.extractionMethod));
  mergedOptions.emit?.({ type: "source_enrichment_completed", data: {
    enriched: enrichedResults.length,
    failures: enrichmentFailures.length,
    extractionProvidersUsed: Object.keys(extractionProviderBreakdown),
    extractionProviderBreakdown,
    fallbackExtractionCount: extractionProviderBreakdown.snippet_fallback ?? 0,
    overlapped: Boolean(earlyEnrichPromise),
  } });

  let citationEligibleEstimate = countRegistryEligibleSources(enrichedResults);
  let repairPass = 0;
  const maxRepairPasses = Math.max(1, RESEARCH_LIMITS[mergedOptions.mode ?? "deep_research"].maxRepairPasses);
  while (!retrievalFailed
    && plan.topUpPolicy.weakBucketTopUp
    && citationEligibleEstimate < mergedOptions.minFinalUniqueCitedSources
    && enrichedResults.length < mergedOptions.maxSourcesToEnrich
    && repairPass < maxRepairPasses) {
    repairPass += 1;
    const repairBuckets = bucketsNeedingPostEnrichmentTopup(plan, enrichedResults, mergedOptions.minFinalUniqueCitedSources);
    const alreadyAttemptedQueries = new Set([
      ...plan.queries.map((query) => query.query),
      ...topUpAttempts.map((attempt) => attempt.query),
    ]);
    const repairQueries = repairBuckets.flatMap((bucketId) => [0, 1].map((variantOffset) => {
      const variant = (repairPass - 1) * 2 + variantOffset;
      return {
      id: `${bucketId}_post_enrichment_topup_${variant + 1}`,
      bucketId,
      query: buildContextualTopUpQuery(bucketId, plan.agendaContract, enrichedResults, variant),
      priority: "top_up" as const,
      expectedDomains: plan.buckets.find((bucket) => bucket.id === bucketId)?.preferredDomains ?? [],
      maxResultsPerQuery: mergedOptions.maxResultsPerQuery ?? 5,
      timeoutMs: mergedOptions.timeoutMs ?? 12000,
      };
    })).filter((query) => {
      if (alreadyAttemptedQueries.has(query.query)) return false;
      alreadyAttemptedQueries.add(query.query);
      return true;
    }).slice(0, mergedOptions.mode === "council" ? 30 : mergedOptions.mode === "deep_research" ? 20 : 12);

    if (repairQueries.length > 0) {
      mergedOptions.emit?.({ type: "source_enrichment_repair_started", data: { citationEligible: citationEligibleEstimate, target: mergedOptions.minFinalUniqueCitedSources, queries: repairQueries.length, repairPass } });
      const repairRaw = await runSearchPlan({ ...plan, queries: repairQueries }, {
        ...mergedOptions,
        onProviderError: (error) => providerErrors.push(error),
        onCacheEvent: cacheEvent,
      });
      topUpAttempts.push(...repairQueries.map((query) => ({ bucketId: query.bucketId, query: query.query, results: repairRaw.filter((result) => result.bucketId === query.bucketId).length })));
      rawResults.push(...repairRaw);

      rescored = scoreAndShape(rawResults, plan);
      rededuped = dedupeByContentSimilarity(dedupeSourcesByCanonicalUrl(rescored));
      finalFilter = filterSourcesForAgenda(rededuped, plan.agendaContract, { withReasons: true });
      refiltered = finalFilter.kept;
      finalFilterRejections = finalFilter.rejected.map((item) => ({
        reason: item.reason,
        detail: item.detail,
        title: item.source.title,
        url: item.source.url,
      }));

      const enrichedUrls = new Set(enrichedResults.map((source) => canonicalizeUrl(source.canonicalUrl ?? source.url)));
      const remainingSlots = Math.max(0, mergedOptions.maxSourcesToEnrich - enrichedResults.length);
      const additionalToEnrich = refiltered
        .filter((source) => !enrichedUrls.has(canonicalizeUrl(source.canonicalUrl ?? source.url)))
        .slice(0, remainingSlots);
      if (additionalToEnrich.length > 0) {
        const repairEnrichment = await enrichRetrievalBatch({
          sources: additionalToEnrich,
          mergedOptions,
          cacheEvent,
          enrichmentFailures,
          enrichmentBudgetMs: Math.max(1000, Math.floor(enrichmentBudgetMs / 2)),
          bucketsById,
        });
        enrichedResults = [...enrichedResults, ...repairEnrichment.results];
        enrichedBase = [...enrichedBase, ...repairEnrichment.enrichedBase];
        extractionProviderBreakdown = countBy(enrichedBase.map((source) => source.extractionProvider ?? source.extractionMethod));
        citationEligibleEstimate = countRegistryEligibleSources(enrichedResults);
      }
      mergedOptions.emit?.({ type: "source_enrichment_repair_completed", data: { enriched: enrichedResults.length, citationEligible: citationEligibleEstimate, target: mergedOptions.minFinalUniqueCitedSources, repairPass } });
    } else {
      break;
    }
  }

  const bucketCoverage = coverageFor(plan, rawResults, refiltered, enrichedResults);
  const failedBuckets = bucketCoverage.filter((bucket) => bucket.kept === 0).map((bucket) => bucket.bucketId);
  const weakBuckets = bucketCoverage.filter((bucket) => bucket.kept > 0 && bucket.kept < 2).map((bucket) => bucket.bucketId);
  const sourceGapReport = citationEligibleEstimate < mergedOptions.minFinalUniqueCitedSources || failedBuckets.length > 0 || weakBuckets.length > 0
    ? {
        requiredUniqueSources: mergedOptions.minFinalUniqueCitedSources,
        availableCitationEligibleSources: citationEligibleEstimate,
        failedBuckets,
        weakBuckets,
        attemptedQueries: plan.queries.map((query) => query.query),
        providerErrors,
        enrichmentFailures,
        filterRejections: finalFilterRejections.length ? finalFilterRejections : filterRejections,
        explanation: `Live retrieval produced ${citationEligibleEstimate} citation-eligible sources; target is ${mergedOptions.minFinalUniqueCitedSources}.`,
        repairAttempted: topUpAttempts.length > 0,
      }
    : null;

  return {
    rawResults,
    dedupedResults: rededuped,
    filteredResults: refiltered,
    enrichedResults,
    bucketCoverage,
    failedBuckets,
    weakBuckets,
    providerErrors,
    enrichmentFailures,
    topUpAttempts,
    sourceGaps: sourceGapReport ? [sourceGapReport.explanation] : [],
    sourceGapReport,
    citationEligibleEstimate,
  };
}

function countBy(values: Array<string | undefined>): Record<string, number> {
  return values.filter((value): value is string => Boolean(value)).reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function enrichmentConcurrencyForMode(mode: ResearchMode, options: { hasJinaKey: boolean; hasScraperApiKey: boolean }): number {
  const envOverride = Number.parseInt(process.env.ENRICHMENT_CONCURRENCY ?? "", 10);
  if (Number.isFinite(envOverride) && envOverride > 0) return envOverride;
  if (options.hasScraperApiKey && process.env.SCRAPERAPI_ENABLED === "true" && process.env.SCRAPERAPI_MAX_CONCURRENCY) {
    const scraperOverride = Number.parseInt(process.env.SCRAPERAPI_MAX_CONCURRENCY, 10);
    if (Number.isFinite(scraperOverride) && scraperOverride > 0) return scraperOverride;
  }
  if (options.hasScraperApiKey && process.env.SCRAPERAPI_ENABLED === "true" && !options.hasJinaKey) {
    return mode === "fast_research" ? 2 : 3;
  }
  const limits = RESEARCH_LIMITS[mode];
  if (limits) return limits.enrichmentConcurrency;
  return options.hasJinaKey ? 5 : 3;
}

export function buildContextualTopUpQuery(
  bucketId: SourceBucketId,
  contract: AgendaContract,
  existingResults: RetrievalSource[],
  variant = 0,
): string {
  const base = buildTopicAwareTopUpQuery(bucketId, contract, variant);
  const entities = extractNamedEntities(existingResults).slice(0, 4).join(" OR ");
  const entityClause = entities ? ` ${entities}` : "";
  const variantHints = ["", "", "pdf report", "committee evidence", "official data", "case analysis", "implementation review", "rights impact"];
  const variantClause = variantHints[variant] ? ` ${variantHints[variant]}` : ` source set ${variant + 1}`;
  return `${base}${entityClause}${variantClause}`.replace(/\s+/g, " ").trim();
}

function agendaKeywords(contract: AgendaContract): string {
  const text = [
    contract.normalizedAgenda,
    ...contract.requiredEntities.slice(0, 4),
    contract.countryFocus ?? "India",
  ].join(" ");
  return [...new Set(text.match(/[A-Za-z][A-Za-z0-9-]{3,}/g) ?? ["India"])].slice(0, 8).join(" ");
}

function extractNamedEntities(results: RetrievalSource[]): string[] {
  const text = results.slice(0, 20).map((result) => `${result.title} ${result.snippet ?? ""}`).join(" ");
  const matches = text.match(/\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}|[A-Z]{2,}(?:-[A-Z0-9]+)?)\b/g) ?? [];
  return [...new Set(matches.map(sanitizeContextEntity).filter((match): match is string => Boolean(match)))];
}

function sanitizeContextEntity(match: string): string | null {
  const normalized = match.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (/\b(?:page|back|home|oops|ooops|error|not found|javascript|enable javascript|run this app)\b/i.test(normalized)) {
    return null;
  }
  const cleaned = normalized
    .split(/\s+/)
    .filter((token) => !/^(?:India|Indian|The|And|For|With|From|Page|Back|Home|Ooops|Oops|Error|Not|Found|JavaScript|Javascript|Enable|Enabled|App|PDF|Advisory|Political|Any|Same|PRS|You)$/i.test(token))
    .join(" ")
    .trim();
  return cleaned.length >= 3 ? cleaned : null;
}

export function inferredBucketIdsForClass(sourceClass: string | undefined): SourceBucketId[] {
  switch (sourceClass) {
    case "indian_major_media":
      return ["indian_major_media"];
    case "general_media":
      return [];
    case "official_government":
      return ["government_official"];
    case "parliamentary_records":
      return ["parliamentary_records"];
    case "court_primary":
    case "legal_commentary":
      return ["court_legal"];
    case "electoral_body":
      return ["electoral_integrity"];
    case "policy_research":
      return ["policy_research"];
    case "academic_journal":
      return ["academic_research"];
    case "human_rights_watchdog":
      return ["human_rights_watchdog"];
    case "press_freedom_index":
      return ["press_freedom"];
    case "digital_rights_watchdog":
      return ["digital_rights"];
    default:
      return [];
  }
}

export function mergeBucketIds(queryBucket: SourceBucketId, sourceClass: string): SourceBucketId[] {
  return [...new Set([...inferredBucketIdsForClass(sourceClass), queryBucket])] as SourceBucketId[];
}

function scoreAndShape(rawResults: RawSearchResult[], plan: BucketedQueryPlan): RetrievalSource[] {
  return rawResults.map((source): RetrievalSource => {
    const score = scoreSourceForAgenda(source, plan.agendaContract);
    return {
      ...source,
      // class-inferred primary so coverage and concentration agree
      bucketIds: mergeBucketIds(source.bucketId, score.sourceClass),
      foundByQueries: [source.foundByQuery],
      score: score.score,
      sourceClass: score.sourceClass,
      scoreReasons: score.reasons,
      citationEligible: false,
    };
  });
}

function coverageFor(plan: BucketedQueryPlan, rawResults: RawSearchResult[], filteredResults: RetrievalSource[], enrichedResults: RetrievalSource[]): BucketCoverageItem[] {
  return plan.buckets.map((bucket) => ({
    bucketId: bucket.id,
    raw: rawResults.filter((source) => source.bucketId === bucket.id).length,
    kept: filteredResults.filter((source) => source.bucketIds.includes(bucket.id)).length,
    enriched: enrichedResults.filter((source) => source.bucketIds.includes(bucket.id)).length,
  }));
}

function bucketsNeedingTopup(plan: BucketedQueryPlan, coverage: BucketCoverageItem[], eligibleCount: number, target: number): SourceBucketId[] {
  const weak = coverage.filter((bucket) => bucket.kept < 2).map((bucket) => bucket.bucketId);
  if (eligibleCount < target) return [...new Set([...weak, ...plan.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId as SourceBucketId)])].slice(0, 8);
  return weak.slice(0, 8);
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function bucketsNeedingPostEnrichmentTopup(plan: BucketedQueryPlan, enrichedResults: RetrievalSource[], target: number): SourceBucketId[] {
  const requiredBucketIds = plan.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId as SourceBucketId);
  const candidateBucketIds = requiredBucketIds.length ? requiredBucketIds : plan.buckets.map((bucket) => bucket.id);
  const ranked = candidateBucketIds
    .map((bucketId) => ({
      bucketId,
      eligible: enrichedResults.filter((source) => isRegistryCitationEligible(source) && source.bucketIds.includes(bucketId)).length,
    }))
    .sort((left, right) => left.eligible - right.eligible);
  // Repair on required-bucket deficits (eligible < 2), not raw aggregate alone.
  const deficits = ranked.filter((item) => item.eligible < 2).map((item) => item.bucketId);
  if (deficits.length > 0) return deficits.slice(0, 8);
  const aggregateEligible = countRegistryEligibleSources(enrichedResults);
  // Live fast_research: 35 eligible across well-stocked buckets skipped repair because every
  // bucket already met perBucketTarget (ceil(40/5)=8) while aggregate stayed under 40.
  if (aggregateEligible < target) {
    return ranked.map((item) => item.bucketId).slice(0, 8);
  }
  // Fallback: weakest required buckets still below a fair per-bucket share.
  const perBucketTarget = Math.max(2, Math.ceil(target / Math.max(1, Math.min(candidateBucketIds.length, 8))));
  return ranked
    .filter((item) => item.eligible < perBucketTarget)
    .map((item) => item.bucketId)
    .slice(0, 8);
}

function countRegistryEligibleSources(sources: RetrievalSource[]): number {
  return sources.filter(isRegistryCitationEligible).length;
}


async function snippetFallbackEnriched(
  source: { title: string; url: string; domain: string; snippet?: string },
  error: string,
  options: SourceEnrichmentOptions,
): Promise<EnrichedSource> {
  const text = source.snippet?.trim() ? source.snippet : null;
  return buildEnriched(source, {
    url: source.url,
    title: source.title,
    text,
    extractionMethod: text ? "snippet_fallback" : "failed",
    extractionProvider: text ? "snippet_fallback" : undefined,
    extractionStatus: text ? "partial" : "failed",
    fallbackExtractionUsed: Boolean(text),
    error,
  }, options);
}

function isRegistryCitationEligible(source: RetrievalSource): boolean {
  // Do not pass agenda relevance score as authorityScore — short-snippet
  // penalties on high-authority domains (e.g. indian_major_media 78-18=60)
  // falsely fail the registry authority floor. Class-based authority is used.
  const normalized = normalizeEvidenceSourceInput({
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    domain: source.domain,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    fullText: source.fullText ?? null,
    snippet: source.snippet ?? null,
    extractionQuality: source.extractionQuality,
    extractionProvider: source.extractionProvider,
    fallbackExtractionUsed: source.fallbackExtractionUsed,
    limitations: source.limitations,
    citationEligible: source.citationEligible,
  });
  return Boolean(normalized?.citationEligible);
}

async function enrichRetrievalBatch(args: {
  sources: RetrievalSource[];
  mergedOptions: Required<Pick<BucketedRetrievalOptions, "maxRawResults" | "maxSourcesToEnrich" | "minCitationEligibleSources" | "minFinalUniqueCitedSources" | "maxConcurrency">> & BucketedRetrievalOptions;
  cacheEvent: (event: string, data: Record<string, unknown>) => void;
  enrichmentFailures: string[];
  enrichmentBudgetMs: number;
  bucketsById: Map<SourceBucketId, { fullTextRequired?: boolean }>;
}): Promise<{ enrichedBase: EnrichedSource[]; results: RetrievalSource[] }> {
  const enrichedBase = await withEnrichmentBudget(
    args.sources.map((source) => ({
      ...source,
      excerpt: source.fullText ?? (!args.mergedOptions.live && args.mergedOptions.allowMock !== false && !args.mergedOptions.enrichFetchFn ? mockFullTextForSource(source) : undefined),
      snippet: source.snippet,
    })),
    {
      jinaKey: args.mergedOptions.providerKeys?.jina ?? process.env.JINA_API_KEY ?? process.env.JINA_KEY,
      firecrawlKey: args.mergedOptions.providerKeys?.firecrawl ?? process.env.FIRECRAWL_API_KEY,
      scraperapiKey: args.mergedOptions.providerKeys?.scraperapi ?? process.env.SCRAPERAPI_KEY,
      zenrowsKey: args.mergedOptions.providerKeys?.zenrows ?? process.env.ZENROWS_API_KEY,
      scrapingbeeKey: args.mergedOptions.providerKeys?.scrapingbee ?? process.env.SCRAPINGBEE_API_KEY,
      geekflareKey: args.mergedOptions.providerKeys?.geekflare ?? process.env.GEEKFLARE_API_KEY,
      fetchFn: args.mergedOptions.enrichFetchFn,
      timeoutMs: args.mergedOptions.extractionTimeoutMs ?? 10000,
      concurrency: enrichmentConcurrencyForMode(args.mergedOptions.mode ?? "deep_research", {
        hasJinaKey: Boolean(args.mergedOptions.providerKeys?.jina ?? process.env.JINA_API_KEY ?? process.env.JINA_KEY),
        hasScraperApiKey: Boolean(args.mergedOptions.providerKeys?.scraperapi ?? process.env.SCRAPERAPI_KEY),
      }),
      useCache: args.mergedOptions.useCache,
      cache: args.mergedOptions.cache,
      onCacheEvent: args.cacheEvent,
      onError: (error) => args.enrichmentFailures.push(error),
      abortSignal: args.mergedOptions.abortSignal,
    },
    args.enrichmentBudgetMs,
  );
  for (const enriched of enrichedBase) {
    if (enriched.enrichmentError?.trim() && !args.enrichmentFailures.includes(enriched.enrichmentError)) {
      args.enrichmentFailures.push(enriched.enrichmentError);
    }
  }

  const results = args.sources.map((source, index): RetrievalSource => {
    const enriched = enrichedBase[index];
    const extractionQuality = enriched.extractionMethod === "failed"
      ? "failed"
      : enriched.extractionMethod === "snippet_fallback"
        ? "snippet"
        : enriched.extractionQuality === "high"
          ? "full"
          : "partial";
    const fullTextRequired = source.bucketIds.some((bucketId) => args.bucketsById.get(bucketId)?.fullTextRequired);
    const hasRequiredFullText = !fullTextRequired
      || (Boolean(enriched.fullText?.trim()) && (extractionQuality === "full" || extractionQuality === "partial"));
    const hasNonFullTextRequiredBucket = source.bucketIds.some((bucketId) => !args.bucketsById.get(bucketId)?.fullTextRequired);
    // Substantive weak snippets already approved by computeCitationEligibility should not be
    // double-killed solely because the bucket prefers full text — keep them limited/weak.
    const weakSnippetPassthrough = Boolean(
      enriched.citationEligible
      && enriched.limitedSource
      && enriched.fullText?.trim()
      && (enriched.extractionMethod === "snippet_fallback" || extractionQuality === "snippet"),
    );
    const passesFullTextGate = hasRequiredFullText || hasNonFullTextRequiredBucket || weakSnippetPassthrough;
    return {
      ...source,
      canonicalUrl: enriched.canonicalUrl ?? source.url,
      fullText: enriched.fullText,
      textLength: enriched.textLength,
      extractionQuality,
      extractionProvider: enriched.extractionProvider,
      extractionStatus: enriched.extractionStatus,
      fallbackExtractionUsed: enriched.fallbackExtractionUsed,
      citationEligible: Boolean(enriched.citationEligible && source.score >= 40 && passesFullTextGate),
      enrichmentCard: enriched.enrichmentCard,
      sourceChunks: enriched.sourceChunks,
      limitedSource: enriched.limitedSource,
      citationStrength: enriched.citationStrength,
      limitations: [
        ...(enriched.enrichmentError ? [`Enrichment failed: ${enriched.enrichmentError}`] : []),
        ...(enriched.extractionMethod === "snippet_fallback" ? ["Snippet-only source; verify before precise use."] : []),
        ...(fullTextRequired && !hasRequiredFullText ? ["Bucket requires full text; snippet-only or low-confidence extraction is weak evidence."] : []),
      ],
    };
  });

  return { enrichedBase, results };
}

export async function withEnrichmentBudget<T extends { title: string; url: string; domain: string; excerpt?: string; snippet?: string }>(
  sources: T[],
  options: SourceEnrichmentOptions,
  budgetMs: number,
): Promise<EnrichedSource[]> {
  const results: EnrichedSource[] = new Array(sources.length);
  const startTime = Date.now();
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(options.concurrency ?? 5, sources.length || 1));
  const controller = new AbortController();
  const abortFromParent = () => {
    const reason = options.abortSignal?.reason;
    if (reason instanceof Error) controller.abort(reason);
    else controller.abort(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
  };
  if (options.abortSignal?.aborted) abortFromParent();
  options.abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const enrichmentOptions = { ...options, abortSignal: controller.signal };
  const providerHealthScope = extractionProviderHealthScope(options);
  enrichmentOptions.extractionCooldown = retrievalCacheManager.hydrateExtractionCooldown(
    enrichmentOptions.extractionCooldown ?? createExtractionCooldown(),
    { emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}), scope: providerHealthScope },
  );
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  let completed = false;
  
  // FIX BUG-2: Clear timer before checking completion to prevent race condition
  const checkCompletionAndClearTimer = () => {
    if (budgetTimer) {
      clearTimeout(budgetTimer);
      budgetTimer = undefined;
    }
    completed = true;
  };
  
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < sources.length) {
      // FIX BUG-4: Check abort signal before each iteration
      if (controller.signal.aborted || Date.now() - startTime >= budgetMs) {
        return;
      }
      const index = cursor;
      cursor += 1;
      if (sources[index]) {
        results[index] = await enrichSource(sources[index], enrichmentOptions).catch(async (error) => {
          if (isAbortError(error) || options.abortSignal?.aborted) throw error;
          const safeError = redactSecretString(error instanceof Error ? error.message : String(error));
          options.onError?.(safeError);
          const reason = controller.signal.aborted && error instanceof Error && error.message.includes("budget exceeded")
            ? "Enrichment budget exceeded"
            : safeError;
          return snippetFallbackEnriched(sources[index], reason, enrichmentOptions);
        });
      }
    }
  });
  const budgetExceeded = new Promise<void>((resolve) => {
    budgetTimer = setTimeout(() => {
      if (!completed) {
        controller.abort(new Error("Enrichment aborted: budget exceeded"));
        // Budget exceeded - mark remaining as failed
        for (let i = 0; i < sources.length; i++) {
          if (!results[i] && sources[i]) {
            results[i] = {
              title: sources[i].title,
              url: sources[i].url,
              domain: sources[i].domain,
              fullText: sources[i].snippet ?? null,
              snippet: sources[i].snippet ?? null,
              textLength: sources[i].snippet?.length ?? 0,
              extractionMethod: "snippet_fallback",
              extractionStatus: "partial",
              fallbackExtractionUsed: true,
              extractionQuality: "low",
              citationEligible: false,
              enrichmentError: "Enrichment budget exceeded",
            };
          }
        }
      }
      resolve();
    }, budgetMs);
  });
  
  // FIX BUG-1: Use Promise.allSettled for graceful degradation instead of Promise.all
  const raceResult = await Promise.race([
    Promise.allSettled(workers).then(results => results.map(r => r.status === 'fulfilled' ? r.value : undefined)),
    budgetExceeded,
  ]);
  
  // FIX BUG-7 & BUG-8: Clear timer and remove listener in finally-like block
  if (budgetTimer) {
    clearTimeout(budgetTimer);
    budgetTimer = undefined;
  }
  options.abortSignal?.removeEventListener("abort", abortFromParent);
  
  // FIX BUG-3: Wait for workers to complete gracefully
  await Promise.allSettled(workers);
  if (enrichmentOptions.extractionCooldown) {
    retrievalCacheManager.persistExtractionCooldown(enrichmentOptions.extractionCooldown, {
      emit: (event) => options.onCacheEvent?.(event.type, event.data ?? {}),
      scope: providerHealthScope,
    });
  }
  for (let i = 0; i < sources.length; i++) {
    if (!results[i] && sources[i]) {
      results[i] = {
        title: sources[i].title,
        url: sources[i].url,
        domain: sources[i].domain,
        fullText: sources[i].snippet ?? null,
        snippet: sources[i].snippet ?? null,
        textLength: sources[i].snippet?.length ?? 0,
        extractionMethod: "snippet_fallback",
        extractionStatus: "partial",
        fallbackExtractionUsed: true,
        extractionQuality: "low",
        citationEligible: false,
        enrichmentError: "Enrichment did not complete before budget cleanup",
      };
    }
  }
  // Rebuild hardcoded ineligible snippet fallbacks through the same eligibility path as enrichSource.
  await Promise.all(results.map(async (result, index) => {
    if (!result || !sources[index]) return;
    const needsRebuild = result.citationEligible === false
      && (result.extractionMethod === "snippet_fallback" || result.fallbackExtractionUsed)
      && Boolean(sources[index].snippet?.trim());
    if (!needsRebuild) return;
    if (result.enrichmentError !== "Enrichment budget exceeded"
      && result.enrichmentError !== "Enrichment did not complete before budget cleanup"
      && !result.enrichmentError) {
      return;
    }
    results[index] = await snippetFallbackEnriched(
      sources[index],
      result.enrichmentError || "snippet fallback rebuild",
      enrichmentOptions,
    );
  }));
  if (options.abortSignal?.aborted) {
    const reason = options.abortSignal.reason;
    if (reason instanceof Error) throw reason;
    throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
  }
  return results;
}

function enrichedMergeKey(source: { canonicalUrl?: string; url: string }): string {
  return canonicalizeUrl(source.canonicalUrl ?? source.url).toLowerCase();
}

function isAbortError(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { name?: string }).name === "AbortError";
}

function extractionProviderHealthScope(options: SourceEnrichmentOptions): string {
  const material = [
    options.jinaKey,
    options.firecrawlKey,
    options.scraperapiKey,
    options.zenrowsKey,
    options.scrapingbeeKey,
    options.geekflareKey,
  ].filter((value): value is string => Boolean(value)).join("|");
  return material ? shortHash(material) : "server-default";
}

function mockFullTextForSource(source: RetrievalSource): string {
  return [
    source.snippet,
    `${source.title} is used as deterministic mock evidence for local pipeline tests only.`,
    "This synthetic local fixture preserves retrieval flow without representing live evidence.",
  ].filter(Boolean).join(" ");
}
