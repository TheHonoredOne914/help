import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { SourceUsagePolicy } from "../../config/source-usage-policy.js";
import type { EvidenceRegistryCore, SourceClass } from "../evidence-registry.js";
import type { CitationStrength, EvidenceSource, ExtractionQuality } from "../evidence-registry-types.js";
import type { SourceBucketId } from "../../retrieval/source-buckets.js";

export type SourceUsageType =
  | "fact_extracted"
  | "number_extracted"
  | "legal_holding_extracted"
  | "limitation_identified"
  | "supports_claim"
  | "challenges_claim"
  | "used_for_reliability_matrix"
  | "used_for_debate_utility"
  | "used_for_citation_audit"
  | "relevant_but_weak"
  | "unknown_invalid";

export interface SourceUsageMapItem {
  sourceId: number;
  title: string;
  bucketIds: SourceBucketId[];
  sourceClass: SourceClass;
  usageType: SourceUsageType;
  extractedClaim?: string;
  extractedNumber?: string;
  legalHolding?: string;
  limitation?: string;
  supportedSection?: string;
  confidence: "high" | "medium" | "low";
  method?: "model_extraction" | "deterministic_extraction";
  groundingStatus?: "grounded" | "ungrounded" | "weak_context";
  evidenceSpan?: SourceUsageEvidenceSpan;
  citationStrength?: CitationStrength;
  limitedSource?: boolean;
}

export interface SourceUsageEvidenceSpan {
  sourceId: number;
  text: string;
  chunkIndex?: number;
  startOffset?: number;
  endOffset?: number;
  extractionQuality: ExtractionQuality | "title_only";
  sharedTokens: string[];
  verifiedBy: "top_chunk" | "key_fact" | "legal_holding" | "key_number" | "full_text" | "snippet" | "limitation";
}

export interface SafeProviderError {
  provider?: string;
  message: string;
  code?: string;
}

export type SourceUsageFailureType =
  | "fake_source_id"
  | "cross_batch_reference"
  | "invalid_usage_type"
  | "missing_required_field"
  | "listing_only"
  | "title_only_source"
  | "boilerplate_claim"
  | "ungrounded_claim"
  | "ineligible_source"
  | "weak_source_not_counted"
  | "snippet_source_not_counted"
  | "failed_source"
  | "unsupported_legal_holding"
  | "repeated_generic_claim"
  | "used_ids_mismatch"
  | "insufficient_valid_sources"
  | "insufficient_bucket_coverage"
  | "all_sources_weak";

export interface StructuredSourceUsageFailure {
  type: SourceUsageFailureType;
  sourceId?: number;
  roleName: string;
  usageType?: SourceUsageType;
  severity: "error" | "warning";
  detail: string;
}

export interface SourceUsageFailureReport {
  roleName: string;
  reason: string;
  assignedSourceCount: number;
  validUsageCount: number;
  invalidUsageCount: number;
  failedSourceIds: number[];
  providerErrors: SafeProviderError[];
  recommendedAction:
    | "retry_smaller_batch"
    | "use_stronger_model"
    | "configure_provider"
    | "allow_source_gap_report"
    | "fail_pipeline";
  structuredFailures?: StructuredSourceUsageFailure[];
}

export interface ModelRoleOutput {
  roleName: string;
  minimumSourceRequirement?: number;
  requiredSourceCount: number;
  receivedSourceIds: number[];
  usedSourceIds: number[];
  unusedSourceIds: number[];
  sourceUsageMap: SourceUsageMapItem[];
  sourceCountUsed?: number;
  sourceRequirementSatisfied?: boolean;
  sourceGapReason?: string;
  sourceUsageCount: number;
  sourceUsageRequirementSatisfied: boolean;
  failureReason?: string;
  providerUsed?: string;
  modelUsed?: string;
  retries?: number;
  sourceUsageFailureReport?: SourceUsageFailureReport;
  output: unknown;
}

export interface SourceUsageValidationReport {
  passed: boolean;
  usedSourceIds: number[];
  uniqueUsedSourceCount: number;
  bucketCount: number;
  failures: string[];
  warnings: string[];
  structuredFailures: StructuredSourceUsageFailure[];
  rawUsedSourceIds: number[];
  rejectedSourceIds: number[];
  approvedSourceIds: number[];
  approvedUsageItems: SourceUsageMapItem[];
  invalidSourceCount: number;
  strongSourceCount: number;
  mediumSourceCount: number;
  weakSourceCount: number;
  snippetSourceCount: number;
}

export interface SourceUsageValidationOptions {
  allowedSourceIds?: Iterable<number>;
  allowWeakContext?: boolean;
}

export interface GroundingResult {
  grounded: boolean;
  claimText: string;
  sharedTokens: string[];
  evidenceSpan?: SourceUsageEvidenceSpan;
  reason?: string;
}

export interface SourceUsageAggregateRoleValidation {
  roleName: string;
  passed: boolean;
  usedSourceIds: number[];
  rejectedSourceIds: number[];
  failures: string[];
  warnings: string[];
  structuredFailures: StructuredSourceUsageFailure[];
  strongSourceCount: number;
  mediumSourceCount: number;
  weakSourceCount: number;
  snippetSourceCount: number;
}

export interface SourceUsageAggregateValidation {
  outputs: ModelRoleOutput[];
  failureReports: NonNullable<ModelRoleOutput["sourceUsageFailureReport"]>[];
  validUsageCount: number;
  validUsedSourceIds: number[];
  rolesPassed: number;
  rolesFailed: number;
  warningRoleCount: number;
  passed: boolean;
  completedWithSourceGaps: boolean;
  perRoleValidation: SourceUsageAggregateRoleValidation[];
  strongSourceCount: number;
  mediumSourceCount: number;
  weakSourceCount: number;
  snippetSourceCount: number;
  invalidSourceCount: number;
}

export interface SourceUsageAggregateInput {
  outputs: ModelRoleOutput[];
  evidenceRegistry: EvidenceRegistryCore;
  agendaContract: AgendaContract;
  policy: SourceUsagePolicy;
}

export type SourceForUsage = Pick<
  EvidenceSource,
  | "id"
  | "title"
  | "url"
  | "bucketIds"
  | "sourceClass"
  | "citationEligible"
  | "citationStrength"
  | "extractionQuality"
  | "limitedSource"
  | "keyFacts"
  | "keyNumbers"
  | "legalHoldings"
  | "limitations"
  | "fullText"
  | "snippet"
  | "topChunks"
>;
