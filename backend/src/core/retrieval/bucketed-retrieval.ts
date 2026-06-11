import { RESEARCH_LIMITS, type ResearchMode } from "../config/research-mode.js";
import { canonicalizeUrl, type SourceClass } from "../evidence/evidence-registry.js";
import { normalizeEvidenceSourceInput } from "../evidence/source-normalizer.js";
import type { AgendaContract } from "../agenda/agenda-contract.js";
import { dedupeByContentSimilarity, dedupeSourcesByCanonicalUrl } from "./source-deduper.js";
import { enrichSources, enrichSource, type EnrichedSource, type SourceEnrichmentOptions } from "./source-enrichment.js";
import { filterSourcesForAgenda } from "./source-filter.js";
import { scoreSourceForAgenda } from "./source-scoring.js";
import { RetrievalError, runSearchPlan, type RawSearchResult, type SearchExecutionOptions } from "./search-executor.js";
import type { BucketedQueryPlan } from "./query-planner.js";
import { logger } from "../../lib/logger.js";
import { multiKeyFetch } from "../../lib/multi-key-fetch.js";
import type { SourceBucketId } from "./source-buckets.js";
import { buildMultiHopExpansion } from "./multi-hop-expander.js";
import { shouldStopRetrievalEarly } from "./early-stopping.js";
import { buildTopicAwareTopUpQuery } from "./query-planning/top-up-query-builder.js";
import { createExtractionCooldown } from "../providers/limits/extraction-cooldown.js";
import { retrievalCacheManager } from "../retrieval-cache/index.js";
import { shortHash } from "../retrieval-cache/retrieval-cache-key.js";
import { redactSecretString } from "../security/secret-redaction.js";

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
  const filteredResults = initialFilter.kept;
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
  const earlyStop = shouldStopRetrievalEarly({
    mode: mergedOptions.mode ?? "deep_research",
    citationEligibleSources: filteredResults.filter((source) => source.citationEligible).length,
    coveredBucketIds: [...new Set(filteredResults.flatMap((source) => source.bucketIds))],
    finalCitationsRealistic: filteredResults.filter((source) => source.citationEligible).length >= mergedOptions.minFinalUniqueCitedSources,
    criticalMissingBucketIds: plan.agendaContract.requiredSourceBuckets
      .map((bucket) => bucket.bucketId)
      .filter((bucketId) => initialCoverage.some((coverage) => coverage.bucketId === bucketId && coverage.kept === 0)),
  });
  if (earlyStop.stop) mergedOptions.emit?.({ type: "latency_early_stop", data: { reason: earlyStop.reason } });
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

  // Multi-hop expansion: case/index/entity/contrarian query expansion.
  // Originally gated to deep_research/council only, which left fast_research
  // with no recovery path beyond contextual bucket top-up when buckets came
  // back weak. Per LOVABLE_RESEARCH_MODE_REQUIREMENTS_AND_FIX_BRIEF.md
  // §"Deep Research" + §"Retrieval and Search", deep must consistently hit
  // its 80-source target. Enable multi-hop for deep_research as well, but
  // cap expansion size to keep provider spend modest. Still gated by
  // earlyStop.stop so it won't run if deep already met its target.
  const expansionModes: ResearchMode[] = ["deep_research", "council"];
  if (!earlyStop.stop && expansionModes.includes(mergedOptions.mode ?? "deep_research")) {
    const expansion = buildMultiHopExpansion({
      round1Results: filteredResults,
      agendaContract: plan.agendaContract,
      weakBuckets: weakForTopup,
      researchAngles: [],
    });
    const expansionCap = mergedOptions.mode === "council" ? 30 : 20;
    const expansionQueryGroups = [
      expansion.caseQueries,
      expansion.indexQueries,
      expansion.entityQueries,
      expansion.contrarianQueries,
    ];
    const expansionQueries: typeof expansion.caseQueries = [];
    for (let index = 0; expansionQueries.length < expansionCap; index += 1) {
      let added = false;
      for (const group of expansionQueryGroups) {
        const query = group[index];
        if (!query) continue;
        expansionQueries.push(query);
        added = true;
        if (expansionQueries.length >= expansionCap) break;
      }
      if (!added) break;
    }
    if (!retrievalFailed && expansionQueries.length > 0) {
      mergedOptions.emit?.({ type: "multi_hop_expansion_started", data: { queries: expansionQueries.length } });
      const expansionRaw = await runSearchPlan({ ...plan, queries: expansionQueries }, {
        ...mergedOptions,
        onProviderError: (error) => providerErrors.push(error),
        onCacheEvent: cacheEvent,
      });
      rawResults.push(...expansionRaw);
      mergedOptions.emit?.({ type: "multi_hop_expansion_completed", data: { queries: expansionQueries.length, rawResults: expansionRaw.length } });
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
  const toEnrich = refiltered.slice(0, mergedOptions.maxSourcesToEnrich);
  mergedOptions.emit?.({ type: "source_enrichment_started", data: { total: toEnrich.length } });
  const enrichmentBudgetMs = mergedOptions.enrichmentBudgetMs
    ?? readPositiveIntegerEnv("RESEARCH_ENRICHMENT_BUDGET_MS")
    ?? RESEARCH_LIMITS[mergedOptions.mode ?? "deep_research"].enrichmentBudgetMs;
  const bucketsById = new Map(plan.buckets.map((bucket) => [bucket.id, bucket]));
  const initialEnrichment = await enrichRetrievalBatch({
    sources: toEnrich,
    mergedOptions,
    cacheEvent,
    enrichmentFailures,
    enrichmentBudgetMs,
    bucketsById,
  });
  let enrichedResults = initialEnrichment.results;
  let enrichedBase = initialEnrichment.enrichedBase;
  let extractionProviderBreakdown = countBy(enrichedBase.map((source) => source.extractionProvider ?? source.extractionMethod));
  mergedOptions.emit?.({ type: "source_enrichment_completed", data: {
    enriched: enrichedResults.length,
    failures: enrichmentFailures.length,
    extractionProvidersUsed: Object.keys(extractionProviderBreakdown),
    extractionProviderBreakdown,
    fallbackExtractionCount: extractionProviderBreakdown.snippet_fallback ?? 0,
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

function scoreAndShape(rawResults: RawSearchResult[], plan: BucketedQueryPlan): RetrievalSource[] {
  return rawResults.map((source): RetrievalSource => {
    const score = scoreSourceForAgenda(source, plan.agendaContract);
    return {
      ...source,
      bucketIds: [source.bucketId],
      foundByQueries: [source.foundByQuery],
      score: score.score,
      sourceClass: score.sourceClass,
      scoreReasons: score.reasons,
      citationEligible: score.score >= 40,
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
  const perBucketTarget = Math.max(2, Math.ceil(target / Math.max(1, Math.min(candidateBucketIds.length, 8))));
  return candidateBucketIds
    .map((bucketId) => ({
      bucketId,
      eligible: enrichedResults.filter((source) => isRegistryCitationEligible(source) && source.bucketIds.includes(bucketId)).length,
    }))
    .sort((left, right) => left.eligible - right.eligible)
    .filter((item, index) => item.eligible < perBucketTarget || index < 3)
    .map((item) => item.bucketId)
    .slice(0, 8);
}

function countRegistryEligibleSources(sources: RetrievalSource[]): number {
  return sources.filter(isRegistryCitationEligible).length;
}

function isRegistryCitationEligible(source: RetrievalSource): boolean {
  const normalized = normalizeEvidenceSourceInput({
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    domain: source.domain,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    authorityScore: source.score,
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
      timeoutMs: args.mergedOptions.extractionTimeoutMs ?? 6000,
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
    return {
      ...source,
      canonicalUrl: enriched.canonicalUrl ?? source.url,
      fullText: enriched.fullText,
      textLength: enriched.textLength,
      extractionQuality,
      extractionProvider: enriched.extractionProvider,
      extractionStatus: enriched.extractionStatus,
      fallbackExtractionUsed: enriched.fallbackExtractionUsed,
      citationEligible: Boolean(enriched.citationEligible && source.score >= 40 && (hasRequiredFullText || hasNonFullTextRequiredBucket)),
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
  const abortFromParent = () => controller.abort();
  if (options.abortSignal?.aborted) controller.abort();
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
        results[index] = await enrichSource(sources[index], enrichmentOptions).catch((error) => {
          const safeError = redactSecretString(error instanceof Error ? error.message : String(error));
          options.onError?.(safeError);
          // FIX BUG-4: Check if abort was the cause
          if (controller.signal.aborted && error instanceof Error && error.message.includes("budget exceeded")) {
            return {
              title: sources[index].title,
              url: sources[index].url,
              domain: sources[index].domain,
              fullText: sources[index].snippet ?? null,
              snippet: sources[index].snippet ?? null,
              textLength: sources[index].snippet?.length ?? 0,
              extractionMethod: "snippet_fallback" as const,
              extractionStatus: "partial" as const,
              fallbackExtractionUsed: true,
              extractionQuality: "low" as const,
              citationEligible: false,
              enrichmentError: "Enrichment budget exceeded",
            };
          }
          return {
            title: sources[index].title,
            url: sources[index].url,
            domain: sources[index].domain,
            fullText: sources[index].snippet ?? null,
            snippet: sources[index].snippet ?? null,
            textLength: sources[index].snippet?.length ?? 0,
            extractionMethod: "snippet_fallback" as const,
            extractionStatus: "partial" as const,
            fallbackExtractionUsed: true,
            extractionQuality: "low" as const,
            citationEligible: false,
            enrichmentError: safeError,
          };
        });
      }
    }
  });
  const budgetExceeded = new Promise<void>((resolve) => {
    budgetTimer = setTimeout(() => {
      if (!completed) {
        controller.abort();
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
  return results;
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
