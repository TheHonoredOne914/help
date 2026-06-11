import type { EvidencePack } from "../../evidence/evidence-pack-builder.js";
import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { ClaimGraph, UnsupportedClaimIssue } from "../../evidence/claim-graph/types.js";
import type { SourceUsageMapItem, ModelRoleOutput } from "../../evidence/source-usage/types.js";
import type { SourceGapReport } from "../../generation/core-answer-generator.js";
import type { DivisionOutput, CanonicalDivisionId } from "../../synthesis/synthesis-engine/types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";

export type UnsupportedClaimAction = "qualify" | "remove" | "source_gap" | "hard_fail";

export type RepairFailureReason = 
  | "no_progress"
  | "max_iterations_reached"
  | "fatal_unrepairable_issue"
  | "hallucination_guard_failed"
  | "legal_guard_failed"
  | "electoral_guard_failed";

export type RepairType =
  | "agenda_drift_repair"
  | "missing_bucket_repair"
  | "source_volume_repair"
  | "citation_repair"
  | "legal_accuracy_repair"
  | "electoral_caution_repair"
  | "un_framing_repair"
  | "indian_parliamentary_framing_repair"
  | "source_gap_disclosure_repair"
  | "citation_overclaim_repair"
  // Division specific
  | "d11_structure_repair"
  | "debate_utility_repair"
  | "strategic_synthesis_repair";

export interface CitationRepairContext {
  agendaContract: import("../../agenda/agenda-contract.js").AgendaContract;
  evidencePacks: EvidencePack[];
  claimLedger: ClaimLedger;
  claimGraph: ClaimGraph;
  sourceUsageMaps: ModelRoleOutput[];
  sourceGapReport?: SourceGapReport | null;
  divisionOutputs?: Map<CanonicalDivisionId, DivisionOutput>;
  registry: EvidenceRegistryCore;
  // B18-14 / BUG-20-14: Legacy repair LLM pass has no registry awareness
}

export interface RepairIterationResult {
  text: string;
  changed: boolean;
  issuesFixed: RepairType[];
  issuesRemaining: RepairType[];
  unsupportedClaimsActioned: number;
}

export interface CitationRepairResult {
  text: string;
  changed: boolean;
  issueTypesFixed: RepairType[];
  fallbackInjected: boolean;
  sourceGapAdded: boolean;
  removedClaims: number;
  remainingIssues: RepairType[];
  failureReason?: RepairFailureReason;
  iterationCount: number;
  // BUG-20-13: D1-D11 outputs returned
  repairedDivisions?: Map<CanonicalDivisionId, DivisionOutput>;
}
