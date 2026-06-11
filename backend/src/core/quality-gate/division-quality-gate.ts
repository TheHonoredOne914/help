import { getDivisionText, wordCount } from "./quality-gate-input.js";
import { runD7DebateQualityGate } from "./d7-debate-quality-gate.js";
import { runD11StrategicQualityGate } from "./d11-strategic-quality-gate.js";
import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";
import type { ModeQualityThresholds } from "./mode-thresholds.js";

const DIVISIONS = [
  ["D1", ["agenda", "india", "thesis"]],
  ["D2", ["dimension", "legal", "political"]],
  ["D3", ["stakeholder", "treasury", "opposition"]],
  ["D4", ["conflict", "contradiction", "mapping"]],
  ["D5", ["narrative", "framing", "public"]],
  ["D6", ["evidence", "source", "verification"]],
  ["D8", ["policy", "pathway", "feasibility"]],
  ["D9", ["if", "predict", "conditional"]],
  ["D10", ["risk", "tradeoff", "overclaim"]],
] as const;

export function runDivisionQualityGate(ctx: QualityGateRuntimeInput, thresholds: ModeQualityThresholds): GateResult {
  const issues: QualityIssue[] = [];
  const divisionResults: Record<string, { passed: boolean; issues: string[]; score: number }> = {};
  let score = 0;

  for (const [id, markers] of DIVISIONS) {
    const text = getDivisionText(ctx.input, id);
    const localIssues: string[] = [];
    if (wordCount(text) < thresholds.divisionMinWords) localIssues.push(`${id} is empty or too thin for mode`);
    for (const marker of markers) if (!new RegExp(`\\b${marker}\\b`, "i").test(text)) localIssues.push(`${id} missing ${marker}`);
    if (/template|lorem|source gap\.?$/i.test(text.trim())) localIssues.push(`${id} appears template-only`);
    if (localIssues.length) {
      issues.push(...localIssues.map((message) => ({ code: `${id}_division_quality`, message, severity: "repair" as const, divisionId: id })));
    }
    const localScore = Math.max(0, 5 - localIssues.length * 2);
    score += localScore;
    divisionResults[id] = { passed: localIssues.length === 0, issues: localIssues, score: localScore };
  }

  const d7 = runD7DebateQualityGate(getDivisionText(ctx.input, "D7"), thresholds);
  const d11 = runD11StrategicQualityGate(getDivisionText(ctx.input, "D11"), ctx, thresholds);
  issues.push(...d7.issues, ...d11.issues);
  divisionResults.D7 = { passed: d7.issues.length === 0, issues: d7.issues.map((issue) => issue.message), score: d7.score };
  divisionResults.D11 = { passed: d11.issues.length === 0, issues: d11.issues.map((issue) => issue.message), score: d11.score };
  score += d7.score + d11.score;

  return {
    score: Math.min(25, Math.round(score / 3)),
    maxScore: 25,
    issues,
    divisionResults,
    metrics: { failedDivisionCount: Object.values(divisionResults).filter((result) => !result.passed).length },
    categoryScores: {
      divisionQuality: Math.min(15, Math.round(score / 4)),
      debateUtility: d7.categoryScores?.debateUtility ?? 0,
      strategicSynthesis: d11.categoryScores?.strategicSynthesis ?? 0,
    },
  };
}

function sectionOrFull(text: string, heading: string): string {
  const match = text.match(new RegExp(`(^|\\n)#{1,3}\\s+${heading}\\b`, "i"));
  if (!match || match.index == null) return text;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/\n#{1,3}\s+/);
  return next === -1 ? rest : rest.slice(0, next);
}
