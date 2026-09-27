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
    // Live smoke: with enrich-cap 90 we cleared 45 eligible; default 60 often stalled ~33–39.
    maxSourcesToEnrich: 90,
    minCitationEligibleSources: 40,
    minFinalUniqueCitedSources: 40,
    providerConcurrency: 4,
    bucketConcurrency: 3,
    enrichmentConcurrency: 8,
    // Live: 72s left Tier-2 wayback at 0 and snippet_fallback ~29/50 after paid misses.
    // 96s keeps theoretical capacity ≥ maxSourcesToEnrich (floor(96k/6k)*8 = 128 ≥ 90).
    enrichmentBudgetMs: 96_000,
    maxRepairPasses: 2,
  },
  deep_research: {
    maxTotalQueries: 56,
    maxRawResults: 180,
    // 120 vs fast's 90: deep has 100s enrichment budget, 10 concurrent, 8s/source → ~125 theoretical max; 120 stays inside 240s total budget.
    maxSourcesToEnrich: 120,
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

/** Map public API labels to internal research modes. web_search is fast_research with a legacy label. */
export function resolvePublicResearchMode(mode?: ResearchMode | "web_search" | "normal" | "deep_research"): ResearchMode | "normal" {
  if (!mode || mode === "normal") return "normal";
  if (mode === "web_search") return "fast_research";
  return mode;
}

export function inferResearchMode(userQuery: string, explicitUserMode?: ResearchMode | "web_search" | "normal" | "deep_research"): ResearchMode {
  const resolved = resolvePublicResearchMode(explicitUserMode);
  if (resolved !== "normal") return resolved;
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
