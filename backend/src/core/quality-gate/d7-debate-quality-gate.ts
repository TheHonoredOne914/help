import { wordCount } from "./quality-gate-input.js";
import type { GateResult, QualityIssue } from "./types.js";
import type { ModeQualityThresholds } from "./mode-thresholds.js";

const STRUCTURED_POI_PATTERNS = [
  /\bWould the (?:delegate|honourable member)\b/i,
  /\bCan the honourable member\b/i,
  /\bIs the Treasury Bench claiming\b/i,
  /\bDoes the Opposition accept\b/i,
  /\bCan the Treasury Bench\b/i,
  /\bCan the Opposition\b/i,
  /\bPOI\s+\d+\s*:\s*(?:Would|Can|Is|Does|Which|What)\b/i,
];

export function runD7DebateQualityGate(text: string, thresholds: ModeQualityThresholds): GateResult {
  const issues: QualityIssue[] = [];
  const lower = text.toLowerCase();
  const structuredPoiCount = countStructuredPois(text);
  if (!/treasury\s+bench/i.test(text)) issues.push({ code: "D7_treasury_missing", message: "D7 missing Treasury Bench arguments", severity: "repair", divisionId: "D7" });
  if (!/opposition/i.test(text)) issues.push({ code: "D7_opposition_missing", message: "D7 missing Opposition arguments", severity: "repair", divisionId: "D7" });
  if (structuredPoiCount < thresholds.d7MinPois) {
    issues.push({ code: "D7_poi_quality", message: `D7 has ${structuredPoiCount} structured POIs below ${thresholds.d7MinPois}`, severity: "repair", divisionId: "D7" });
  }
  if (!/\brebuttal|counter\b/i.test(text)) issues.push({ code: "D7_rebuttal_missing", message: "D7 missing rebuttals", severity: "repair", divisionId: "D7" });
  if (!/\bamendment|motion|operative clause|preambular clause\b/i.test(text)) issues.push({ code: "D7_floor_language_missing", message: "D7 lacks amendment, motion, or clause language", severity: "repair", divisionId: "D7" });
  if (wordCount(text) < thresholds.divisionMinWords * 2) issues.push({ code: "D7_too_thin", message: "D7 is too thin for mode", severity: "repair", divisionId: "D7" });
  const score = Math.max(0, 12 - issues.length * 3 + (/\bsource|citation|\[Source\s+\d+\]/i.test(text) ? 2 : 0) + (lower.includes("floor") ? 1 : 0));
  return {
    score: Math.min(15, score),
    maxScore: 15,
    issues,
    metrics: { structuredPoiCount },
    categoryScores: { debateUtility: Math.min(10, Math.max(0, score)) },
  };
}

export function countStructuredPois(text: string): number {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => STRUCTURED_POI_PATTERNS.some((pattern) => pattern.test(line)))
    .length;
}
