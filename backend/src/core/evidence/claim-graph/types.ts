import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";
import type { EvidencePack } from "../evidence-pack-builder.js";
import type { CitationStrength, EvidenceRegistryCore, ExtractionQuality, SourceClass } from "../evidence-registry.js";
import type { ModelRoleOutput, SourceUsageAggregateValidation, SourceUsageMapItem, SourceUsageValidationReport } from "../source-usage-map.js";

export type ClaimType =
  | "score"
  | "rank"
  | "legal_holding"
  | "official_position"
  | "incident"
  | "allegation"
  | "trend"
  | "interpretation"
  | "debate_argument"
  | "fact"
  | "opinion"
  | "prediction"
  | "argument";

export type ClaimValidationStatus = "approved" | "rejected" | "contextual" | "registry_only";

export interface ClaimSourceTrace {
  sourceId: number;
  sourceClass: SourceClass;
  citationStrength: CitationStrength;
  extractionQuality: ExtractionQuality | "title_only";
  validationStatus: ClaimValidationStatus;
  usageType?: SourceUsageMapItem["usageType"];
  roleName?: string;
  evidenceSpan?: string;
  limitation?: string;
}

export interface EvidenceClaim {
  id: string;
  text: string;
  type: ClaimType;
  claimType?: ClaimType;
  requiredSourceClasses: SourceClass[];
  supportingSourceIds: number[];
  confidence: "high" | "medium" | "low";
  mustUseCarefulLanguage: boolean;
  forbiddenIfUnsupported: boolean;
  supportScore?: number;
  counterclaimIds?: string[];
  contradictionIds?: string[];
  citationStrength?: CitationStrength;
  sourceClasses?: SourceClass[];
  limitations?: string[];
  validationStatus?: ClaimValidationStatus;
  extractionQuality?: ExtractionQuality | "title_only";
  requiresCarefulLanguageReason?: string;
  sourceTrace?: ClaimSourceTrace[];
  normalizedText?: string;
  bucketIds?: string[];
}

export interface ClaimCounterclaim {
  id: string;
  text: string;
  challengedClaimId?: string;
  sourceIds: number[];
  sourceClasses: SourceClass[];
  supportScore: number;
  requiresCarefulLanguage: boolean;
  limitation?: string;
}

export interface ClaimContradiction {
  id: string;
  claimIds: string[];
  type: "numeric_conflict" | "legal_holding_conflict" | "official_watchdog_conflict" | "trend_direction_conflict";
  description: string;
  severity: "high" | "medium" | "low";
  sourceIds: number[];
}

export type UnsupportedClaimAction = "qualify" | "remove" | "source_gap" | "hard_fail";

export type UnsupportedClaimIssue =
  | { type: "unsupported_score"; claim: string; action?: UnsupportedClaimAction; requiredValue?: string }
  | { type: "unsupported_rank"; claim: string; action?: UnsupportedClaimAction; requiredValue?: string }
  | { type: "fake_judgment"; claim: string; action?: UnsupportedClaimAction }
  | { type: "unsupported_fraud_claim"; claim: string; action?: UnsupportedClaimAction }
  | { type: "unsupported_high_risk_claim"; claim: string; action?: UnsupportedClaimAction };

export interface ClaimGraphDiagnostics {
  registryClaimCount: number;
  evidenceCardClaimCount: number;
  sourceUsageClaimCount: number;
  dedupedClaimCount: number;
  rejectedSourceClaimCount: number;
  carefulLanguageClaimCount: number;
  promptEligibleClaimCount: number;
}

export interface ClaimGraph {
  claims: EvidenceClaim[];
  counterclaims?: ClaimCounterclaim[];
  contradictions?: ClaimContradiction[];
  unsupportedClaims?: UnsupportedClaimIssue[];
  diagnostics?: ClaimGraphDiagnostics;
  summary?: {
    claimCount: number;
    counterclaimCount: number;
    contradictionCount: number;
    strongClaimCount: number;
    carefulLanguageClaimCount: number;
    approvedSourceCount: number;
  };
}

export interface BuildClaimGraphOptions {
  modelRoleOutputs?: ModelRoleOutput[];
  sourceUsageAggregate?: SourceUsageAggregateValidation | {
    validUsedSourceIds: number[];
    perRoleValidation?: SourceUsageAggregateValidation["perRoleValidation"];
  };
  validationReports?: SourceUsageValidationReport[];
  evidencePacks?: EvidencePack[];
  mode?: ResearchMode;
}

export interface ClaimGraphBuildContext {
  registry: EvidenceRegistryCore;
  contract: AgendaContract;
  options: BuildClaimGraphOptions;
  approvedSourceIds: Set<number>;
  rejectedSourceIds: Set<number>;
}

export interface RawClaimInput {
  text: string;
  sourceId: number;
  sourceClass: SourceClass;
  citationStrength: CitationStrength;
  extractionQuality: ExtractionQuality | "title_only";
  confidence: "high" | "medium" | "low";
  validationStatus: ClaimValidationStatus;
  usageType?: SourceUsageMapItem["usageType"];
  roleName?: string;
  supportedSection?: string;
  limitation?: string;
  evidenceSpan?: string;
  bucketIds?: string[];
  suggestedType?: ClaimType;
  fromCounterclaim?: boolean;
}
