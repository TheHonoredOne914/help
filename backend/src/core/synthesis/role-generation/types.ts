import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";
import type { ClaimGraph } from "../../evidence/claim-graph.js";
import type { EvidenceCard, EvidencePack } from "../../evidence/evidence-pack-builder.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { SourceGapReport } from "../../evidence/source-gap-report.js";
import type {
  ModelRoleOutput,
  SafeProviderError,
  SourceUsageFailureReport,
  SourceUsageMapItem,
  SourceUsageValidationReport,
} from "../../evidence/source-usage-map.js";
import type { ProviderName } from "../../providers/provider-types.js";
import type { ProviderRouter } from "../../providers/provider-router.js";
import type { ProviderResearchStatus } from "../../providers/provider-health.js";
import type { ProviderRunState } from "../../providers/provider-run-state.js";

export const ROLE_GENERATION_SCHEMA_VERSION = "brick17.role-generation.v1";

export type RoleGenerationRoleName =
  | "retrieval_critic"
  | "evidence_extractor"
  | "thesis_synthesizer"
  | "citation_auditor"
  | "indian_parliamentary_strategist"
  | "final_quality_auditor"
  | "legal_analyst"
  | "data_analyst"
  | string;

export interface RoleDefinition {
  name: RoleGenerationRoleName;
  label: string;
  supportedSections: string[];
  focus: string[];
  primaryUsageTypes: SourceUsageMapItem["usageType"][];
}

export interface RoleInstructionContext {
  supportedSection?: string;
  claimGraphContext?: string;
  sourceGapContext?: string;
  assignedSourceIds?: number[];
  stricter?: boolean;
}

export interface RolePrompt {
  system: string;
  user: string;
}

export interface ModelRoleRunnerInput {
  roleName: string;
  evidenceCards: EvidenceCard[];
  minimumSourceRequirement?: number;
  output?: unknown;
}

export interface ModelRoleSourceUsageInput extends ModelRoleRunnerInput {
  evidenceRegistry: EvidenceRegistryCore;
  agendaContract: AgendaContract;
  mode: "model" | "deterministic";
  providerRouter?: ProviderRouter;
  providerName?: ProviderName;
  model?: string;
  batchSize?: number;
  fallbackModels?: Array<{ providerName: ProviderName; model: string }>;
  autoFallback?: boolean;
  providerStatuses?: ProviderResearchStatus[];
  allowDeterministicExtractionFallback?: boolean;
  sourceUsageTimeoutMs?: number;
  emitSourceUsageEvent?: (type: string, data?: Record<string, unknown>) => void;
  researchMode?: ResearchMode;
  providerRunState?: ProviderRunState;
  requestId?: string;
  claimGraph?: ClaimGraph;
  sourceGapReport?: SourceGapReport | null;
}

export interface RoleSourceUsageResult {
  roleName: string;
  requiredSourceCount: number;
  assignedSourceIds: number[];
  usedSourceIds: number[];
  sourceUsageMap: SourceUsageMapItem[];
  sourceUsageCount: number;
  passed: boolean;
  failures: string[];
  providerUsed?: string;
  modelUsed?: string;
  retries: number;
  sourceUsageFailureReport?: SourceUsageFailureReport;
}

export interface RoleGenerationPayload {
  schemaVersion: typeof ROLE_GENERATION_SCHEMA_VERSION;
  roleName: string;
  researchMode: ResearchMode | "unknown";
  roleSummary: string;
  roleFindings: Array<{
    sourceId: number;
    usageType: SourceUsageMapItem["usageType"];
    finding: string;
    confidence: SourceUsageMapItem["confidence"];
    supportedSection?: string;
  }>;
  sourceQualityFindings: {
    strong: number;
    medium: number;
    weak: number;
    limited: number;
    snippet: number;
    failed: number;
  };
  divisionHints: string[];
  retryMetadata?: {
    retries: number;
    providerUsed?: string;
    modelUsed?: string;
    recoveredDeterministically?: boolean;
    providerErrors?: SafeProviderError[];
  };
  validation?: SourceUsageValidationReport;
}

export interface RoleCardSelectionResult {
  cards: EvidenceCard[];
  warning?: string;
}

export interface RoleRetryPromptInput {
  roleName: string;
  researchMode: ResearchMode;
  failedSourceIds: number[];
  failures: string[];
  previousPromptFingerprint?: string;
}

export interface RoleOutputValidationInput {
  roleName: string;
  items: SourceUsageMapItem[];
  evidenceRegistry: EvidenceRegistryCore;
  agendaContract: AgendaContract;
  requiredCount: number;
  allowedSourceIds: Iterable<number>;
}

export type EvidencePackMap = Record<string, EvidencePack>;
