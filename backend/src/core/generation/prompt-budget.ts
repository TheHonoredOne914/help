import { RESEARCH_LIMITS, type ResearchMode } from "../config/research-mode.js";
import type { ProviderName } from "../providers/provider-types.js";
import { getLimitProfile } from "../providers/limits/provider-limit-registry.js";

export interface PromptBudget {
  providerName: ProviderName;
  model: string;
  mode: ResearchMode;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxPromptChars: number;
  maxSourcesInPrompt: number;
  maxEvidencePacks: number;
  maxCardsPerPack: number;
  maxFactsPerSource: number;
  compressionLevel: number;
  targetUniqueCitations: number;
  sourceCardTarget: number;
}

export interface PromptBudgetReport {
  providerName: ProviderName;
  model: string;
  estimatedTokens: number;
  estimatedInputTokens: number;
  providerMaxInputTokens: number;
  maxInputTokens: number;
  originalSources: number;
  includedSources: number;
  droppedSourceIds: number[];
  droppedReason: Record<number, string>;
  originalPacks: number;
  includedPacks: number;
  compressionApplied: boolean;
  compressionLevel: number;
  truncatedSections: string[];
  targetUniqueCitations?: number;
  sourceCardTarget?: number;
  includedMustIncludeSourceIds?: number[];
  missingMustIncludeSourceIds?: number[];
  sourceFloorBreach?: {
    mode: ResearchMode;
    floor: number;
    available: number;
    included: number;
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil((text.length / 3.4) * 1.28);
}

export function getPromptBudget(input: {
  providerName: ProviderName;
  model: string;
  mode: ResearchMode;
  compressionLevel?: number;
}): PromptBudget {
  const compressionLevel = Math.max(0, input.compressionLevel ?? 0);
  const fast = input.mode === "fast_research";
  const deep = input.mode === "deep_research";
  const council = input.mode === "council";
  let maxInputTokens = fast ? 24_000 : deep ? 42_000 : council ? 80_000 : 18_000;
  let maxPromptChars = fast ? 84_000 : deep ? 150_000 : council ? 280_000 : 64_000;
  let maxOutputTokens = fast ? 3_200 : deep ? 5_500 : council ? 8_500 : 5_000;
  let maxSourcesInPrompt = fast ? 40 : deep ? 80 : council ? 180 : 24;
  let maxEvidencePacks = fast ? 10 : deep ? 16 : council ? 24 : 10;
  let maxCardsPerPack = fast ? 4 : deep ? 5 : council ? 8 : 5;
  let maxFactsPerSource = fast ? 1 : deep ? 1 : council ? 1 : 3;
  const sourceCardTarget = RESEARCH_LIMITS[input.mode].minFinalUniqueCitedSources;

  if (input.providerName === "groq") {
    const gptOss = input.model.includes("gpt-oss");
    const largeGroq = input.model.includes("llama-3.3-70b-versatile") || gptOss;
    maxInputTokens = gptOss ? (fast ? 4_200 : deep ? 3_600 : council ? 10_000 : 3_200) : largeGroq ? (fast ? 8_000 : deep ? 6_500 : council ? 10_000 : 5_500) : 4_000;
    maxPromptChars = gptOss ? (fast ? 16_000 : deep ? 13_000 : council ? 36_000 : 12_000) : largeGroq ? (fast ? 28_000 : deep ? 22_000 : council ? 36_000 : 18_000) : 14_000;
    maxOutputTokens = gptOss ? (fast ? 3_000 : deep ? 3_000 : 2_200) : fast ? 3_000 : deep ? 3_800 : 2_500;
    maxSourcesInPrompt = fast ? 40 : deep ? 80 : council ? 180 : 24;
    maxEvidencePacks = fast ? 8 : deep ? 12 : 7;
    maxCardsPerPack = fast ? 2 : deep ? 2 : 3;
    maxFactsPerSource = 1;
  } else if (input.providerName === "nvidia" && input.model.includes("kimi")) {
    maxInputTokens = fast ? 20_000 : deep ? 42_000 : council ? 80_000 : 18_000;
    maxPromptChars = fast ? 68_000 : deep ? 150_000 : council ? 280_000 : 64_000;
    maxOutputTokens = fast ? 3_200 : deep ? 5_500 : council ? 8_500 : 7_000;
    maxSourcesInPrompt = fast ? 40 : deep ? 80 : council ? 180 : 24;
  } else if (input.providerName === "gemini") {
    maxInputTokens = fast ? 40_000 : deep ? 80_000 : council ? 120_000 : 64_000;
    maxPromptChars = fast ? 140_000 : deep ? 280_000 : council ? 420_000 : 240_000;
    maxOutputTokens = fast ? 3_500 : deep ? 6_000 : council ? 8_500 : 7_000;
    maxSourcesInPrompt = fast ? 40 : deep ? 80 : council ? 180 : 36;
  } else if (input.providerName === "github") {
    maxInputTokens = fast ? 14_000 : deep ? 22_000 : council ? 60_000 : 14_000;
    maxPromptChars = fast ? 46_000 : deep ? 76_000 : council ? 210_000 : 52_000;
    maxOutputTokens = fast ? 2_600 : deep ? 4_200 : council ? 8_000 : 3_000;
    maxSourcesInPrompt = fast ? 40 : deep ? 80 : council ? 180 : 24;
  }

  const shrink = Math.min(0.65, compressionLevel * 0.18);
  const providerSafeInputTokens = getLimitProfile(input.providerName, input.model).safeInputBudget;
  const compressedInputTokens = Math.max(3_000, Math.floor(maxInputTokens * (1 - shrink)));
  const effectiveInputTokens = Math.min(compressedInputTokens, providerSafeInputTokens);
  return {
    providerName: input.providerName,
    model: input.model,
    mode: input.mode,
    maxInputTokens: effectiveInputTokens,
    maxOutputTokens: Math.max(900, Math.floor(maxOutputTokens * (1 - shrink * 0.5))),
    maxPromptChars: Math.max(12_000, Math.floor(maxPromptChars * (1 - shrink))),
    maxSourcesInPrompt: Math.max(sourceCardTarget, Math.floor(maxSourcesInPrompt * (1 - shrink))),
    maxEvidencePacks: Math.max(2, Math.floor(maxEvidencePacks * (1 - shrink))),
    maxCardsPerPack: Math.max(1, Math.floor(maxCardsPerPack * (1 - shrink))),
    maxFactsPerSource: Math.max(1, Math.floor(maxFactsPerSource * (1 - shrink))),
    compressionLevel,
    targetUniqueCitations: sourceCardTarget,
    sourceCardTarget,
  };
}
