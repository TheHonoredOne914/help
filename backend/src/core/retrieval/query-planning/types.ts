import type { AgendaContract, AgendaLens, TopicType } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";
import type { SourceBucket, SourceBucketId } from "../source-buckets.js";

export type QueryPriority = "domain_targeted" | "broad_discovery" | "top_up";

export type QueryPlanSource =
  | "static"
  | "fallback"
  | "freshness"
  | "parliamentary"
  | "top_up"
  | "llm";

export type QueryPlanStrategy =
  | "baseline"
  | "high_confidence"
  | "angle"
  | "primary_source"
  | "multi_hop"
  | "timeline"
  | "counterargument"
  | "comparative"
  | "fallback";

export type QueryDriftStatus = "clean" | "rejected";

export interface PlannedBucketQuery {
  id: string;
  bucketId: SourceBucketId;
  query: string;
  priority: QueryPriority;
  expectedDomains: string[];
  maxResultsPerQuery: number;
  timeoutMs: number;
  source?: QueryPlanSource;
  roleLens?: AgendaLens | string;
  freshnessTags?: string[];
  topicType?: TopicType;
  strategy?: QueryPlanStrategy;
  telemetryId?: string;
  driftStatus?: QueryDriftStatus;
  rejectedReason?: string;
}

export type BucketedQuery = PlannedBucketQuery;

export interface QueryPlanTelemetryEntry {
  telemetryId: string;
  queryText: string;
  bucketId: SourceBucketId;
  topicType: TopicType;
  mode: ResearchMode;
  priority: QueryPriority;
  expectedDomains: string[];
  freshnessTags: string[];
  source: QueryPlanSource;
  strategy: QueryPlanStrategy;
  status: "generated" | "deduped" | "rejected";
  driftStatus: QueryDriftStatus;
  rejectedReason?: string;
}

export interface BucketedQueryPlan {
  requestId: string;
  agendaContract: AgendaContract;
  buckets: SourceBucket[];
  queries: BucketedQuery[];
  retryPolicy: { retries: number; backoffMs: number };
  topUpPolicy: { minCitationEligibleSources: number; minFinalUniqueCitedSources: number; weakBucketTopUp: boolean };
  queryTelemetry?: QueryPlanTelemetryEntry[];
}

export interface QueryCandidate {
  bucketId: SourceBucketId;
  query: string;
  expectedDomains?: string[];
  priority?: QueryPriority;
  source: QueryPlanSource;
  roleLens?: AgendaLens | string;
  freshnessTags?: string[];
  strategy?: QueryPlanStrategy;
}

export interface QueryPlanningContext {
  contract: AgendaContract;
  mode: ResearchMode;
  buckets: SourceBucket[];
  keywords: string;
}

export interface ProviderJsonLikeRouter {
  completeJson(providerName: string, request: {
    model: string;
    roleName?: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    retries?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ json: unknown; content?: string; provider?: string; model?: string }>;
}

export interface QueryExpansionOptions {
  providerRouter?: ProviderJsonLikeRouter;
  providerName?: string;
  model?: string;
  timeoutMs?: number;
}

export const PHD_RESEARCH_LIMITS = {
  maxTotalQueries: 100,
  maxRawResults: 400,
  maxDedupedResults: 250,
  maxSourcesToEnrich: 120,
  maxEvidenceRegistrySources: 90,
  minCitationEligibleSources: 40,
  minFinalUniqueCitedSources: 30,
  minEvidenceCardsPerModel: 30,
  maxRepairPasses: 3,
  providerConcurrency: 4,
  bucketConcurrency: 3,
  enrichmentConcurrency: 5,
  queryTimeoutMs: 12000,
  enrichmentTimeoutMs: 15000,
  totalPipelineTimeoutMs: 180000,
} as const;
