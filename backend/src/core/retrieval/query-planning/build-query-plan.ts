import type { AgendaContract } from "../../agenda/agenda-contract.js";
import { RESEARCH_LIMITS, type ResearchMode } from "../../config/research-mode.js";
import type { SourceBucket, SourceBucketId } from "../source-buckets.js";
import { selectQueryBuckets } from "./bucket-selector.js";
import { buildFallbackQueriesForBucket } from "./fallback-query-builder.js";
import { buildFreshnessQueries } from "./freshness-query-builder.js";
import { expandQueriesWithLlm } from "./llm-query-expander.js";
import { buildModeSpecificQueries, getModeQueryStrategy, strategyForTemplate } from "./mode-query-strategy.js";
import { buildParliamentaryQueries } from "./parliamentary-query-builder.js";
import { dedupePlannedQueries } from "./query-deduper.js";
import { filterResolvedQueryDrift } from "./query-drift-filter.js";
import { makeTelemetryId, telemetryForCandidate } from "./query-plan-telemetry.js";
import { validateQueryPlan } from "./query-plan-validator.js";
import { resolveQueryTemplate } from "./query-template-resolver.js";
import { buildTopUpQueries } from "./top-up-query-builder.js";
import type { BucketedQueryPlan, PlannedBucketQuery, QueryCandidate, QueryExpansionOptions, QueryPlanTelemetryEntry } from "./types.js";
import { PHD_RESEARCH_LIMITS } from "./types.js";

export function buildBucketedQueryPlan(contract: AgendaContract, mode: ResearchMode = "deep_research"): BucketedQueryPlan {
  return buildPlanFromCandidates(contract, mode, deterministicCandidates(contract, mode));
}

export async function buildBucketedQueryPlanWithExpansion(
  contract: AgendaContract,
  mode: ResearchMode = "deep_research",
  options: QueryExpansionOptions = {},
): Promise<BucketedQueryPlan> {
  const strategy = getModeQueryStrategy(mode);
  const base = deterministicCandidates(contract, mode);
  const telemetry: QueryPlanTelemetryEntry[] = [];
  if (strategy.includeLlm) {
    const expansion = await expandQueriesWithLlm(contract, mode, options);
    for (const rejected of expansion.rejected) {
      telemetry.push({
        telemetryId: `llm_rejected_${telemetry.length + 1}`,
        queryText: rejected,
        bucketId: "policy_research",
        topicType: contract.topicType,
        mode,
        priority: "broad_discovery",
        expectedDomains: [],
        freshnessTags: [],
        source: "llm",
        strategy: "angle",
        status: "rejected",
        driftStatus: "rejected",
        rejectedReason: rejected,
      });
    }
    base.unshift(...expansion.queries);
  }
  const plan = buildPlanFromCandidates(contract, mode, base);
  return { ...plan, queryTelemetry: [...telemetry, ...(plan.queryTelemetry ?? [])] };
}

function deterministicCandidates(contract: AgendaContract, mode: ResearchMode): QueryCandidate[] {
  const buckets = selectQueryBuckets(contract);
  const strategy = getModeQueryStrategy(mode);
  const candidates: QueryCandidate[] = [];
  for (const bucket of buckets) {
    candidates.push(...buildModeSpecificQueries(contract, mode, bucket));
    const templateLimit = Math.min(strategy.templateLimitPerBucket, bucket.queryTemplates.length);
    for (const template of bucket.queryTemplates.slice(0, templateLimit)) {
      const query = resolveQueryTemplate(template, contract, bucket);
      candidates.push({
        bucketId: bucket.id,
        query,
        expectedDomains: bucket.preferredDomains,
        priority: /\bsite:|\.org|\.in|\.com/i.test(query) ? "domain_targeted" : "broad_discovery",
        source: "static",
        strategy: strategyForTemplate(query, mode),
      });
    }
    if (strategy.includeFallback) candidates.push(...buildFallbackQueriesForBucket(contract, bucket.id));
    if (strategy.includeFreshness) candidates.push(...buildFreshnessQueries(contract, bucket.id));
    if (strategy.includeTopUp) candidates.push(...buildTopUpQueries(contract, bucket.id));
  }
  if (strategy.includeParliamentary) candidates.push(...buildParliamentaryQueries(contract));
  if (strategy.includeTimeline) candidates.push(...buildSpectrumQueries(contract, "timeline"));
  if (strategy.includeCounterargument) candidates.push(...buildSpectrumQueries(contract, "counterargument"));
  if (strategy.includeComparative) candidates.push(...buildSpectrumQueries(contract, "comparative"));
  return candidates;
}

function buildPlanFromCandidates(contract: AgendaContract, mode: ResearchMode, candidates: QueryCandidate[]): BucketedQueryPlan {
  const buckets = selectQueryBuckets(contract);
  const bucketById = new Map<SourceBucketId, SourceBucket>(buckets.map((bucket) => [bucket.id, bucket]));
  const telemetry: QueryPlanTelemetryEntry[] = [];
  const planned: PlannedBucketQuery[] = [];
  const strategy = getModeQueryStrategy(mode);

  candidates.forEach((candidate, index) => {
    const bucket = bucketById.get(candidate.bucketId);
    if (!bucket) return;
    const drift = filterResolvedQueryDrift(candidate.query, contract);
    const telemetryId = makeTelemetryId(candidate.bucketId, index);
    if (!drift.accepted) {
      telemetry.push(telemetryForCandidate({
        telemetryId,
        candidate,
        contract,
        mode,
        status: "rejected",
        driftStatus: "rejected",
        rejectedReason: drift.rejectedReason,
      }));
      return;
    }
    const query: PlannedBucketQuery = {
      id: telemetryId,
      bucketId: candidate.bucketId,
      query: candidate.query,
      priority: candidate.priority ?? (/\bsite:/i.test(candidate.query) ? "domain_targeted" : "broad_discovery"),
      expectedDomains: candidate.expectedDomains ?? bucket.preferredDomains,
      maxResultsPerQuery: strategy.maxResultsPerQuery,
      timeoutMs: PHD_RESEARCH_LIMITS.queryTimeoutMs,
      source: candidate.source,
      roleLens: candidate.roleLens,
      freshnessTags: candidate.freshnessTags,
      topicType: contract.topicType,
      strategy: candidate.strategy ?? "baseline",
      telemetryId,
      driftStatus: "clean",
    };
    planned.push(query);
    telemetry.push(telemetryForCandidate({ telemetryId, candidate: { ...candidate, expectedDomains: query.expectedDomains }, contract, mode, status: "generated" }));
  });

  const deduped = dedupePlannedQueries(planned);
  for (const item of deduped.deduped) {
    telemetry.push({
      telemetryId: item.telemetryId ?? item.id,
      queryText: item.query,
      bucketId: item.bucketId,
      topicType: contract.topicType,
      mode,
      priority: item.priority,
      expectedDomains: item.expectedDomains,
      freshnessTags: item.freshnessTags ?? [],
      source: item.source ?? "static",
      strategy: item.strategy ?? "baseline",
      status: "deduped",
      driftStatus: item.driftStatus ?? "clean",
      rejectedReason: item.rejectedReason,
    });
  }

  const limits = RESEARCH_LIMITS[mode] ?? PHD_RESEARCH_LIMITS;
  return validateQueryPlan({
    requestId: contract.requestId,
    agendaContract: contract,
    buckets,
    queries: deduped.queries.slice(0, Math.min(limits.maxTotalQueries, strategy.maxTotalQueries)),
    retryPolicy: { retries: 2, backoffMs: 500 },
    topUpPolicy: {
      minCitationEligibleSources: limits.minCitationEligibleSources,
      minFinalUniqueCitedSources: limits.minFinalUniqueCitedSources,
      weakBucketTopUp: true,
    },
    queryTelemetry: telemetry,
  });
}

function buildSpectrumQueries(contract: AgendaContract, strategy: "timeline" | "counterargument" | "comparative"): QueryCandidate[] {
  const subject = contract.normalizedAgenda.replace(/\s+/g, " ").trim();
  const variants: Array<{ bucketId: SourceBucketId; suffix: string; priority?: "domain_targeted" | "broad_discovery" }> = strategy === "timeline"
    ? [
        { bucketId: "government_official", suffix: "timeline policy changes India" },
        { bucketId: "parliamentary_records", suffix: "site:sansad.in timeline parliament question" },
        { bucketId: "indian_major_media", suffix: "latest chronology Indian media" },
        { bucketId: "policy_research", suffix: "implementation timeline policy research" },
      ]
    : strategy === "counterargument"
      ? [
          { bucketId: "indian_major_media", suffix: "opposition criticism government response India" },
          { bucketId: "parliamentary_records", suffix: "Treasury Bench Opposition debate parliament" },
          { bucketId: "policy_research", suffix: "risks limitations policy critique India" },
          { bucketId: "court_legal", suffix: "rights challenge legal objection India" },
        ]
      : [
          { bucketId: "policy_research", suffix: "comparative policy lessons India" },
          { bucketId: "academic_research", suffix: "comparative academic research India" },
          { bucketId: "government_official", suffix: "international comparison official policy India" },
          { bucketId: "indian_major_media", suffix: "comparative explained Indian media" },
        ];
  return variants.map((variant) => ({
    bucketId: variant.bucketId,
    query: `${subject} ${variant.suffix}`.replace(/\s+/g, " ").trim(),
    source: "fallback",
    strategy,
    priority: /\bsite:/i.test(variant.suffix) ? "domain_targeted" : "broad_discovery",
  }));
}
