import type { ResearchTerminalStatus } from "../pipeline/pipeline-metadata.js";
import type { ProviderName } from "../providers/provider-types.js";
import type { SourceBucketId } from "../retrieval/source-buckets.js";

export type RetrievingCouncillorId =
  | "C1_LEGAL"
  | "C2_ECONOMIC"
  | "C3_STRATEGIC"
  | "C4_SOCIAL"
  | "C5_HISTORICAL"
  | "C6_OPPOSITION";

export type CouncillorId = RetrievingCouncillorId | "C7_CHIEF";

export type CouncilStance = "government" | "opposition" | "independent";
export type ClaimConfidence = "high" | "medium" | "low";
export type CouncillorStatus = "pending" | "running" | "complete" | "failed";

export interface CouncilModelAssignment {
  providerName: ProviderName;
  model: string;
}

export interface CouncillorRole {
  id: CouncillorId;
  title: string;
  shortTitle: string;
  perspective: string;
  retrievalFocus: SourceBucketId[];
  retrievesEvidence: boolean;
}

export interface CouncillorPlan {
  councillor_id: RetrievingCouncillorId;
  title: string;
  perspective: string;
  retrieval_focus: SourceBucketId[];
  query_lens: string;
}

export interface ClaimObject {
  claim_id: string;
  text: string;
  source_ids: string[];
  councillor_id: CouncillorId;
  confidence: ClaimConfidence;
  stance: "supports" | "challenges" | "neutral";
  tags: string[];
}

export interface CouncillorOutput {
  councillor_id: RetrievingCouncillorId;
  title: string;
  perspective: string;
  status: CouncillorStatus;
  summary: string;
  raw_brief: string;
  key_claims: ClaimObject[];
  evidence_pack_ids: string[];
  sources_used: string[];
  started_at: string;
  completed_at?: string;
  error?: string;
}

export interface CouncilSeal {
  seal_id: string;
  claim: ClaimObject;
  level: "council_endorsed" | "probable" | "contested";
  endorsing_councillors: RetrievingCouncillorId[];
  support_count: number;
  supporting_claim_ids: string[];
}

export interface CouncilDispute {
  dispute_id: string;
  claim_a: ClaimObject;
  claim_b: ClaimObject;
  conflict_type: "direct_contradiction" | "scope_disagreement" | "evidence_conflict";
  summary: string;
  councillors: RetrievingCouncillorId[];
}

export interface CouncilDeliberationResult {
  seals: CouncilSeal[];
  disputes: CouncilDispute[];
  agreementScore: number;
}

export interface CouncilVerdict {
  strategic_position: string;
  top_arguments: Array<{ argument: string; strength: "strong" | "moderate" }>;
  top_vulnerabilities: Array<{ vulnerability: string; severity: "high" | "medium" }>;
  recommended_speech_strategy: string;
  opening_speech_variants: Array<{ style: "aggressive" | "measured" | "rhetorical"; text: string }>;
  poi_bank: Array<{ poi: string; timing_cue: string; target_councillor?: string }>;
  clash_matrix: { government_args: string[]; opposition_args: string[]; crossfire_points: string[] };
}

export interface CouncilSession {
  session_id: string;
  topic: string;
  stance: CouncilStance;
  status: "expanding" | "retrieving" | "briefing" | "deliberating" | "synthesizing" | "complete" | "error";
  councillors: Record<RetrievingCouncillorId, CouncillorOutput | null>;
  seals: CouncilSeal[];
  disputes: CouncilDispute[];
  agreement_score: number;
  verdict: CouncilVerdict | null;
  terminalStatus: ResearchTerminalStatus;
  created_at: string;
  completed_at?: string;
}

export interface CouncilSourceSummary {
  id: string;
  title: string;
  url: string;
  bucketIds: string[];
}
