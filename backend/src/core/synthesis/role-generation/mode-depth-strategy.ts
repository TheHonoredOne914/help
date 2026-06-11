import type { ResearchMode } from "../../config/research-mode.js";

export interface ModeDepthStrategy {
  mode: ResearchMode;
  instruction: string;
  maxFindingsPerSource: number;
  chunkCount: number;
}

export function getModeDepthStrategy(mode: ResearchMode): ModeDepthStrategy {
  switch (mode) {
    case "fast_research":
      return {
        mode,
        instruction: "Fast mode: quick extraction, few high-signal claims, concise limitations, and weak context allowed only when labelled.",
        maxFindingsPerSource: 1,
        chunkCount: 2,
      };
    case "deep_research":
      return {
        mode,
        instruction: "Deep mode: require stronger extraction per usable source, source-specific claims, and explicit limitations.",
        maxFindingsPerSource: 2,
        chunkCount: 3,
      };
    case "council":
      return {
        mode,
        instruction: "Council mode: produce compact evidence-grounded findings suitable for independent councillor briefs and cross-examination.",
        maxFindingsPerSource: 2,
        chunkCount: 3,
      };
  }
}
