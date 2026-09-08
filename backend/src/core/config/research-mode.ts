export type ResearchMode = "fast_research" | "deep_research" | "council";

export interface ResearchLimitConfig {
  maxTotalQueries: number;
  maxRawResults: number;
  maxSourcesToEnrich: number;
  minCitationEligibleSources: number;
  minFinalUniqueCitedSources: number;
  minEvidenceCardsPerModel?: number;
  providerConcurrency: number;
  bucketConcurrency: number;
  enrichmentConcurrency: number;
  enrichmentBudgetMs: number;
  maxRepairPasses: number;
}

export const RESEARCH_LIMITS: Record<ResearchMode, ResearchLimitConfig> = {
  fast_research: {
    maxTotalQueries: 36,
    maxRawResults: 120,
    maxSourcesToEnrich: 60,
    minCitationEligibleSources: 40,
    minFinalUniqueCitedSources: 40,
    providerConcurrency: 4,
    bucketConcurrency: 3,
    enrichmentConcurrency: 8,
    enrichmentBudgetMs: 72_000,
    maxRepairPasses: 2,
  },
  deep_research: {
    maxTotalQueries: 56,
    maxRawResults: 180,
    maxSourcesToEnrich: 90,
    minCitationEligibleSources: 45,
    minFinalUniqueCitedSources: 45,
    providerConcurrency: 4,
    bucketConcurrency: 3,
    enrichmentConcurrency: 10,
    enrichmentBudgetMs: 100_000,
    maxRepairPasses: 2,
  },
  council: {
    maxTotalQueries: 180,
    maxRawResults: 720,
    maxSourcesToEnrich: 220,
    minCitationEligibleSources: 110,
    minFinalUniqueCitedSources: 110,
    minEvidenceCardsPerModel: 30,
    providerConcurrency: 6,
    bucketConcurrency: 6,
    enrichmentConcurrency: 16,
    enrichmentBudgetMs: 480_000,
    maxRepairPasses: 4,
  },
};

export function inferResearchMode(userQuery: string, explicitUserMode?: ResearchMode | "web_search" | "normal" | "deep_research"): ResearchMode {
  if (explicitUserMode && explicitUserMode !== "normal" && explicitUserMode !== "web_search") return explicitUserMode;
  const lower = userQuery.toLowerCase();
  if (/\b(deep|detailed|research|serious prep)\b/.test(lower)) return "deep_research";
  if (/\b(quick|short|brief|fast)\b/.test(lower)) return "fast_research";
  return "fast_research";
}

export function isCoreGenerationDefault(mode: ResearchMode): boolean {
  if (mode === "council") return false;
  return mode === "deep_research" || mode === "fast_research";
}

export function agendaOutputDepthForMode(mode: ResearchMode): "brief" | "detailed" {
  if (mode === "fast_research") return "brief";
  return "detailed";
}
