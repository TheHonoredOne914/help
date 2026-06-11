export type RetrievingCouncillorId =
  | "C1_LEGAL"
  | "C2_ECONOMIC"
  | "C3_STRATEGIC"
  | "C4_SOCIAL"
  | "C5_HISTORICAL"
  | "C6_OPPOSITION";

export type CouncillorId = RetrievingCouncillorId | "C7_CHIEF";

export const RETRIEVING_COUNCILLOR_IDS: readonly RetrievingCouncillorId[] = [
  "C1_LEGAL",
  "C2_ECONOMIC",
  "C3_STRATEGIC",
  "C4_SOCIAL",
  "C5_HISTORICAL",
  "C6_OPPOSITION",
];

export interface ClaimObject {
  claim_id: string;
  text: string;
  source_ids: string[];
  councillor_id: CouncillorId;
  confidence: "high" | "medium" | "low";
  stance: "supports" | "challenges" | "neutral";
  tags: string[];
}

export interface CouncillorOutput {
  councillor_id: RetrievingCouncillorId;
  title: string;
  perspective: string;
  status: "pending" | "running" | "complete" | "failed";
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
  stance: "government" | "opposition" | "independent";
  status: "expanding" | "retrieving" | "briefing" | "deliberating" | "synthesizing" | "complete" | "error";
  councillors: Record<RetrievingCouncillorId, CouncillorOutput | null>;
  seals: CouncilSeal[];
  disputes: CouncilDispute[];
  agreement_score: number;
  chief_verdict_stream: string;
  verdict: CouncilVerdict | null;
  terminalStatus?: string;
  created_at: string;
  completed_at?: string;
}
