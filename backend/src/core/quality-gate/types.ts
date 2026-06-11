import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { ResearchMode } from "../config/research-mode.js";
import type { ClaimGraph } from "../evidence/claim-graph.js";
import type { ClaimLedger } from "../evidence/claim-ledger.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import type { SourceGapReport } from "../evidence/source-gap-report.js";
import type { ModelRoleOutput, SourceUsageValidationReport } from "../evidence/source-usage-map.js";

export type QualityIssueSeverity = "fatal" | "repair" | "warning";

export interface QualityIssue {
  code: string;
  message: string;
  severity: QualityIssueSeverity;
  divisionId?: string;
}

export interface QualityGateInput {
  uniqueCitedSourceIds: number[];
  citedBucketIds: string[];
  modelRoleOutputs: ModelRoleOutput[];
  mode?: ResearchMode;
  claimGraph?: ClaimGraph | null;
  claimLedger?: ClaimLedger | null;
  evidenceRegistry?: EvidenceRegistryCore;
  sourceUsageValidationReport?: SourceUsageValidationReport | null;
  divisionOutputs?: Map<string, string> | Record<string, string> | null;
  sourceGapReport?: SourceGapReport | unknown;
  fallbackStatus?: "none" | "legacy_fallback_used" | "degraded_fallback" | "deterministic_fallback";
  repairPassHistory?: unknown[];
}

export interface QualityTelemetry {
  overallScore: number;
  categoryScores: Record<string, number>;
  mode: ResearchMode | "legacy";
  passed: boolean;
  fatalIssueCount: number;
  warningCount: number;
  repairRequiredCount: number;
  divisionResults: Record<string, { passed: boolean; issues: string[]; score: number }>;
  sourceDiversityMetrics: Record<string, number>;
  citationGroundingMetrics: Record<string, number>;
  repairConvergence?: unknown;
}

export interface QualityGateReport {
  passed: boolean;
  score: number;
  categoryScores: Record<string, number>;
  automaticFailures: string[];
  warnings: string[];
  fatalIssues: string[];
  repairRequiredIssues: string[];
  warningIssues: string[];
  repairRequired: boolean;
  issues?: QualityIssue[];
  telemetry?: QualityTelemetry;
}

export interface QualityGateRuntimeInput {
  finalText: string;
  contract: AgendaContract;
  registry: EvidenceRegistryCore;
  input: QualityGateInput;
}

export interface GateResult {
  score: number;
  maxScore: number;
  issues: QualityIssue[];
  warnings?: string[];
  metrics?: Record<string, number>;
  categoryScores?: Record<string, number>;
  divisionResults?: Record<string, { passed: boolean; issues: string[]; score: number }>;
}
