import type { EvidenceSource, CitationStrength, SourceClass } from "../../evidence/evidence-registry-types.js";
import type { ClaimLedgerItem, ClaimLedger } from "../../evidence/claim-ledger.js";
import type { ClaimGraph, EvidenceClaim, ClaimCounterclaim } from "../../evidence/claim-graph/types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";

// ── Core citation injection context ──

export interface CitationInjectionContext {
  registry: EvidenceRegistryCore;
  approvedSourceIds: number[];
  claimLedger: ClaimLedger;
  claimGraph: ClaimGraph;
  sectionPlan: string[];
}

// ── Per-section citation plan ──

export interface SectionCitationPlan {
  sectionName: string;
  selectedSourceIds: number[];
  claimIds: string[];
  strategy: "bucket_match" | "claim_match" | "authority_fallback" | "hash_fallback" | "citation_gap";
  citationGap?: boolean;
}

// ── Per-division citation plan ──

export interface DivisionCitationPlan {
  divisionKey: string;
  selectedSourceIds: number[];
  treasuryBenchIds: number[];
  oppositionIds: number[];
  strategy: "claim_graph" | "bucket_match" | "authority_fallback" | "citation_gap";
}

// ── Counterclaim citation entry ──

export interface CounterclaimCitationEntry {
  counterclaimId: string;
  counterclaimText: string;
  challengedClaimId: string | undefined;
  counterclaimSourceIds: number[];
  originalClaimSourceIds: number[];
}

// ── Citation contract result ──

export interface CitationContractResult {
  passed: boolean;
  violations: CitationContractViolation[];
  uncitedSentences?: string[];
}

export interface CitationContractViolation {
  type: "missing_citation" | "unapproved_source" | "ineligible_source" | "counterclaim_missing_own_source" | "clustered_citations";
  description: string;
  sentenceIndex?: number;
  sourceId?: number;
}

// ── Source quality filter result ──

export interface SourceQualityAssessment {
  sourceId: number;
  eligible: boolean;
  citationStrength: CitationStrength;
  sourceClass: SourceClass;
  reason?: string;
}

// ── Citation ID resolution ──

export interface CitationIdMapping {
  oldId: number;
  newId: number;
  reason: "merge" | "renumber" | "dedup";
}

// ── Telemetry ──

export interface CitationInjectionTelemetry {
  totalSectionsProcessed: number;
  totalDivisionsProcessed: number;
  totalClaimsMatched: number;
  fallbackSectionsCount: number;
  counterclaimsCited: number;
  averageSourcesPerSection: number;
}
