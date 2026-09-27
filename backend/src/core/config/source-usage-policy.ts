import type { ResearchMode } from "./research-mode.js";
import type { ResearchRole } from "../providers/model-strategy.js";

export type SourceUsagePolicyMode = ResearchMode | "web_search";

export interface SourceUsagePolicy {
  requiredSources: number;
  perRoleMinimum: number;
  minimumToProceed: number;
  strictFailure: boolean;
  allowCompletedWithSourceGaps: boolean;
  allowDeterministicExtractionFallback: boolean;
  roleCount: number;
}

export function getSourceUsagePolicy(mode: SourceUsagePolicyMode): SourceUsagePolicy {
  switch (mode) {
    case "web_search":
    case "fast_research":
      return {
        requiredSources: 40,
        perRoleMinimum: 10,
        minimumToProceed: 40,
        strictFailure: false,
        allowCompletedWithSourceGaps: false,
        allowDeterministicExtractionFallback: true,
        roleCount: 4,
      };
    case "deep_research":
      return {
        requiredSources: 45,
        perRoleMinimum: 20,
        minimumToProceed: 45,
        strictFailure: false,
        allowCompletedWithSourceGaps: true,
        allowDeterministicExtractionFallback: true,
        roleCount: 3,
      };
    case "council":
      // Align with RESEARCH_LIMITS.council (110): citing 180 unique sources inside
      // the 3000–5500 word band is unreachable even with healthy retrieval (~167 eligible).
      // Union floor is the contract; roles are coverage workers, not each a full-floor gate.
      return {
        requiredSources: 110,
        perRoleMinimum: 30,
        minimumToProceed: 110,
        strictFailure: false,
        allowCompletedWithSourceGaps: true,
        allowDeterministicExtractionFallback: true,
        roleCount: 6,
      };
  }
}

/** Curated role slate per mode — not a blind slice of SOURCE_USAGE_RESEARCH_ROLES. */
export function getSourceUsageRolesForMode(mode: SourceUsagePolicyMode): ResearchRole[] {
  switch (mode) {
    case "web_search":
    case "fast_research":
      // Include data_analyst + strategist so mechanism/debate roles actually run.
      return [
        "retrieval_critic",
        "evidence_extractor",
        "data_analyst",
        "indian_parliamentary_strategist",
      ];
    case "deep_research":
      return [
        "evidence_extractor",
        "data_analyst",
        "legal_analyst",
      ];
    case "council":
      return [
        "retrieval_critic",
        "evidence_extractor",
        "data_analyst",
        "legal_analyst",
        "indian_parliamentary_strategist",
        "citation_auditor",
      ];
  }
}
