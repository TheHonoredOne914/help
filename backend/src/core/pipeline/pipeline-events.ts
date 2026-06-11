import { redactSecretsDeep } from "../security/secret-redaction.js";
import type { ResearchMode } from "../config/research-mode.js";

export type PipelineEventType =
  | "request_received"
  | "agenda_contract_created"
  | "archive_safety_checked"
  | "source_bucket_plan_created"
  | "bucket_search_started"
  | "bucket_search_completed"
  | "bucket_search_failed"
  | "retrieval_incomplete"
  | "retrieval_cache_hit"
  | "retrieval_cache_miss"
  | "retrieval_cache_negative_hit"
  | "retrieval_cache_write"
  | "retrieval_cache_invalidate"
  | "retrieval_cache_stale_skipped"
  | "retrieval_cache_schema_mismatch"
  | "provider_cooldown_active"
  | "provider_cooldown_extended"
  | "extraction_negative_cache_hit"
  | "academic_metadata_cache_hit"
  | "extraction_quality_degraded"
  | "bucket_topup_started"
  | "source_dedup_completed"
  | "source_filter_completed"
  | "source_scoring_completed"
  | "multi_hop_expansion_started"
  | "multi_hop_expansion_completed"
  | "source_enrichment_started"
  | "source_enrichment_completed"
  | "evidence_registry_created"
  | "evidence_pack_created"
  | "claim_graph_created"
  | "model_plan_validated"
  | "model_role_started"
  | "provider_health_checked"
  | "model_role_completed"
  | "source_usage_started"
  | "source_usage_batch_started"
  | "source_usage_batch_retry"
  | "source_usage_provider_fallback"
  | "source_usage_completed"
  | "source_usage_failed"
  | "source_usage_failure_report"
  | "source_usage_warning"
  | "source_usage_map_created"
  | "archive_routing_completed"
  | "research_angles_generated"
  | "dimension_engine_completed"
  | "core_generation_started"
  | "synthesis_started"
  | "citation_audit_started"
  | "hallucination_audit_started"
  | "quality_gate_completed"
  | "division_outputs_ready"
  | "repair_pass_started"
  | "repair_pass_completed"
  | "source_gap_report_created"
  | "source_floor_breach"
  | "latency_stage_started"
  | "latency_stage_completed"
  | "latency_budget_warning"
  | "latency_early_stop"
  | "latency_timeout"
  | "final_answer_ready"
  | "legacy_fallback_used"
  | "pipeline_failed"
  | "completed"
  | "completed_with_source_gaps"
  | "degraded_fallback"
  | "provider_error"
  | "failed"
  | "cancelled";

export interface PipelineEvent {
  type: PipelineEventType;
  requestId: string;
  data?: Record<string, unknown>;
}

export interface ResearchRunIdentity {
  runId: string;
  requestId: string;
  conversationId: number | string;
  userMessageId?: number | string;
  assistantMessageId?: number | string;
  queryHash: string;
  researchMode: ResearchMode;
  archiveId?: number | string;
  createdAt: string;
}

export function makePipelineEvent(type: PipelineEventType, requestId: string, data: Record<string, unknown> = {}): PipelineEvent {
  return redactSecretsDeep({ type, requestId, data });
}
