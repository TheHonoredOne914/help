import type { ResearchMode } from "./research-mode.js";

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
      return {
        requiredSources: 180,
        perRoleMinimum: 30,
        minimumToProceed: 180,
        strictFailure: true,
        allowCompletedWithSourceGaps: false,
        allowDeterministicExtractionFallback: false,
        roleCount: 6,
      };
  }
}
