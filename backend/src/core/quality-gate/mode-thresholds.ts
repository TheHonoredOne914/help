import type { ResearchMode } from "../config/research-mode.js";

export interface ModeQualityThresholds {
  minScore: number;
  minCitedSources: number;
  minSourceClasses: number;
  minBuckets: number;
  maxSnippetRatio: number;
  maxWeakRatio: number;
  maxBucketConcentrationRatio: number;
  d7MinPois: number;
  d11MinWords: number;
  divisionMinWords: number;
  /**
   * Minimum total word count for the final assembled answer.
   * Enforced by final-answer-length-gate. Set to 0 to disable.
   * Per LOVABLE_RESEARCH_MODE_REQUIREMENTS_AND_FIX_BRIEF.md:
   *   fast_research:    1000
   *   deep_research:    2000
   *   council:          3000
   */
  finalAnswerMinWords: number;
  /**
   * Maximum total word count for the final assembled answer.
   * Enforced by final-answer-length-gate (severity "repair" + length_trim_repair).
   * Set to 0 to disable. Per brief §9:
   *   deep_research:    3000
   *   council:          5500
   */
  finalAnswerMaxWords: number;
  requireClaimGrounding: boolean;
  requireContradictions: boolean;
}

export const MODE_THRESHOLDS: Record<ResearchMode, ModeQualityThresholds> = {
  fast_research: {
    minScore: 70,
    minCitedSources: 20,
    minSourceClasses: 3,
    minBuckets: 3,
    maxSnippetRatio: 0.65,
    maxWeakRatio: 0.7,
    maxBucketConcentrationRatio: 0.7,
    d7MinPois: 5,
    d11MinWords: 35,
    divisionMinWords: 18,
    finalAnswerMinWords: 1000,
    finalAnswerMaxWords: 0,
    requireClaimGrounding: false,
    requireContradictions: false,
  },
  deep_research: {
    minScore: 82,
    minCitedSources: 80,
    minSourceClasses: 5,
    minBuckets: 5,
    maxSnippetRatio: 0.45,
    maxWeakRatio: 0.5,
    maxBucketConcentrationRatio: 0.55,
    d7MinPois: 8,
    d11MinWords: 55,
    divisionMinWords: 28,
    finalAnswerMinWords: 2000,
    finalAnswerMaxWords: 3000,
    requireClaimGrounding: true,
    requireContradictions: false,
  },
  council: {
    minScore: 86,
    minCitedSources: 180,
    minSourceClasses: 6,
    minBuckets: 7,
    maxSnippetRatio: 0.35,
    maxWeakRatio: 0.4,
    maxBucketConcentrationRatio: 0.45,
    d7MinPois: 0,
    d11MinWords: 0,
    divisionMinWords: 0,
    finalAnswerMinWords: 3000,
    finalAnswerMaxWords: 5500,
    requireClaimGrounding: true,
    requireContradictions: true,
  },
};


export function resolveQualityMode(mode: ResearchMode | undefined, outputDepth?: string): ResearchMode | "legacy" {
  if (mode) return mode;
  if (outputDepth === "brief") return "fast_research";
  if (outputDepth === "detailed") return "deep_research";
  return "legacy";
}

export function thresholdsFor(mode: ResearchMode | "legacy"): ModeQualityThresholds {
  return mode === "legacy" ? MODE_THRESHOLDS.deep_research : MODE_THRESHOLDS[mode];
}
