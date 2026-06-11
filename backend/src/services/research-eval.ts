import { redactSecretsDeep } from "../core/security/secret-redaction.js";
import type { ResearchMode } from "../core/config/research-mode.js";

export interface ResearchEvalRecord {
  requestId: string;
  timestamp: string;
  mode: ResearchMode;
  agendaType: string;
  committeeType: string;
  latencyMs: number;
  usedCoreGeneration: boolean;
  usedLegacyFallback: boolean;
  totalQueries: number;
  rawResults: number;
  enrichedSources: number;
  evidenceRegistrySources: number;
  citationEligibleSources: number;
  finalUniqueCitedSources: number;
  sourceBucketsCovered: number;
  divisionsGenerated: number;
  divisionsRepaired: string[];
  qualityGateScore: number;
  sourceUsageContractPassed: boolean;
  archiveRoutingAction?: string;
  researchAnglesGenerated: number;
  cacheHits: number;
  cacheMisses: number;
  modelCalls: number;
  providerErrors: string[];
}

export function createResearchEvalRecord(input: Omit<ResearchEvalRecord, "timestamp" | "providerErrors"> & { timestamp?: string; providerErrors: string[] }): ResearchEvalRecord {
  return {
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString(),
    providerErrors: redactSecretsDeep(input.providerErrors),
  };
}
