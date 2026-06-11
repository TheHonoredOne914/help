import type { GateResult, QualityTelemetry } from "./types.js";
import type { ResearchMode } from "../config/research-mode.js";

export function buildQualityTelemetry(input: {
  score: number;
  categoryScores: Record<string, number>;
  mode: ResearchMode | "legacy";
  passed: boolean;
  fatalIssues: string[];
  warnings: string[];
  repairRequiredIssues: string[];
  gateResults: GateResult[];
  repairConvergence?: unknown;
}): QualityTelemetry {
  return {
    overallScore: input.score,
    categoryScores: input.categoryScores,
    mode: input.mode,
    passed: input.passed,
    fatalIssueCount: input.fatalIssues.length,
    warningCount: input.warnings.length,
    repairRequiredCount: input.repairRequiredIssues.length,
    divisionResults: Object.assign({}, ...input.gateResults.map((result) => result.divisionResults ?? {})),
    sourceDiversityMetrics: mergeMetrics(input.gateResults, ["citedCount", "sourceClassCount", "bucketCount", "snippetRatio", "weakRatio", "concentrationRatio"]),
    citationGroundingMetrics: mergeMetrics(input.gateResults, ["linkedCitationCount", "graphClaimCount", "ledgerItemCount", "groundedCitationCount"]),
    repairConvergence: input.repairConvergence,
  };
}

function mergeMetrics(results: GateResult[], keys: string[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const result of results) {
    for (const [key, value] of Object.entries(result.metrics ?? {})) {
      if (keys.includes(key)) output[key] = value;
    }
  }
  return output;
}
