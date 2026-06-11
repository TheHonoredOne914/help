/**
 * Brick 18 — Synthesis Engine types.
 *
 * Canonical type surface for the synthesis-engine module.
 * All division synthesis, quality gating, repair, and final-answer
 * integration flows consume these types.
 */

import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";
import type { ClaimGraph, EvidenceClaim } from "../../evidence/claim-graph.js";
import type { EvidencePack } from "../../evidence/evidence-pack-builder.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { ModelRoleOutput } from "../../evidence/source-usage-map.js";
import type { SourceGapReport } from "../../evidence/source-gap-report.js";
import type { ResearchAngle } from "../../archive/research-angle-engine.js";
import type { DimensionEngineOutput } from "../../../lib/types.js";
import type { ProviderName } from "../../providers/provider-types.js";
import type { ProviderRouter } from "../../providers/provider-router.js";
import type { ProviderRunState } from "../../providers/provider-run-state.js";
import type { ProviderResearchStatus } from "../../providers/provider-health.js";

// ---------------------------------------------------------------------------
// Division output types
// ---------------------------------------------------------------------------

/**
 * Canonical division identifiers — single key per division (B18-34 fix).
 * No more `D${n}_${id}` duplicate keys.
 */
export type CanonicalDivisionId =
  | "core_brief"
  | "analytical_dimensions"
  | "stakeholder_mapping"
  | "conflict_mapping"
  | "narrative_analysis"
  | "evidence_verification"
  | "debate_utility"
  | "policy_pathways"
  | "predictive_analysis"
  | "resolution_support"
  | "strategic_insights";

export const CANONICAL_DIVISION_IDS: readonly CanonicalDivisionId[] = [
  "core_brief",
  "analytical_dimensions",
  "stakeholder_mapping",
  "conflict_mapping",
  "narrative_analysis",
  "evidence_verification",
  "debate_utility",
  "policy_pathways",
  "predictive_analysis",
  "resolution_support",
  "strategic_insights",
] as const;

export interface DivisionOutput {
  divisionId: CanonicalDivisionId;
  divisionNumber: number;
  text: string;
  isFallback: boolean;
  qualityPassed: boolean;
  qualityIssues: string[];
  claimCount: number;
}

// ---------------------------------------------------------------------------
// Synthesis engine input
// ---------------------------------------------------------------------------

export interface SynthesisEngineInput {
  requestId: string;
  userQuery: string;
  mode: ResearchMode;
  agendaContract: AgendaContract;
  evidenceRegistry: EvidenceRegistryCore;
  evidencePacks: EvidencePack[];
  claimGraph: ClaimGraph;
  claimLedger: ClaimLedger;
  modelRoleOutputs: ModelRoleOutput[];
  researchAngles?: ResearchAngle[];
  sourceGapReport?: SourceGapReport | null;
  dimensionWeights?: DimensionEngineOutput | null;

  // Generation config
  generationMode?: "model" | "deterministic";
  providerRouter?: ProviderRouter;
  providerName?: ProviderName;
  model?: string;
  providerRunState?: ProviderRunState;
  providerStatuses?: ProviderResearchStatus[];
  autoFallback?: boolean;
  trustRegisteredProvidersWithoutStatus?: boolean;
  providerCallTimeoutMs?: number;
  promptCompressionLevel?: number;
  allowSyntheticSourceUsage?: boolean;
  forceFinalSourceIds?: number[];
}

// ---------------------------------------------------------------------------
// Synthesis engine result
// ---------------------------------------------------------------------------

export interface SynthesisEngineResult {
  divisionOutputs: Map<CanonicalDivisionId, DivisionOutput>;
  divisionTextMap: Map<string, string>;
  divisionContext: string;
  diagnostics: SynthesisEngineDiagnostics;
}

export interface SynthesisEngineDiagnostics {
  divisionOrder: CanonicalDivisionId[];
  claimCountByDivision: Record<string, number>;
  claimGraphClaimCount: number;
  discardedClaimCount: number;
  fallbackDivisionCount: number;
  qualityFailedDivisionCount: number;
}
