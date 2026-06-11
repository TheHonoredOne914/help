import { normalizeText, wordCount } from "./quality-gate-input.js";
import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";
import type { ModeQualityThresholds } from "./mode-thresholds.js";

export function runD11StrategicQualityGate(text: string, ctx: QualityGateRuntimeInput, thresholds: ModeQualityThresholds): GateResult {
  const issues: QualityIssue[] = [];
  if (wordCount(text) < thresholds.d11MinWords) issues.push({ code: "template_or_thin_d11", message: "template_or_thin_d11: D11 is too short for mode", severity: "fatal", divisionId: "D11" });
  for (const marker of ["Diagnosis", "Prescription", "Warning"]) {
    if (!new RegExp(`\\b${marker}\\b`, "i").test(text)) {
      issues.push({ code: "D11_missing_marker", message: `D11 missing ${marker}`, severity: "repair", divisionId: "D11" });
    }
  }
  const divisionReferences = (text.match(/\bD(?:1|2|3|4|5|6|7|8|9|10)\b/g) ?? []).length;
  if (divisionReferences < 2) issues.push({ code: "D11_no_prior_divisions", message: "D11 does not use D1-D10 insights", severity: "repair", divisionId: "D11" });
  if (!/\bcontradiction|counterclaim|tradeoff|fault line|strategic centre|central contradiction\b/i.test(text)) {
    issues.push({ code: "D11_no_strategic_logic", message: "D11 lacks strategic contradiction/counterclaim logic", severity: "repair", divisionId: "D11" });
  }
  if (thresholds.requireContradictions && ((ctx.input.claimGraph?.contradictions ?? []).length === 0 && (ctx.input.claimGraph?.counterclaims ?? []).length === 0)) {
    issues.push({ code: "D11_claim_graph_contradictions_missing", message: "D11 needs ClaimGraph counterclaims or contradictions in strict mode", severity: "fatal", divisionId: "D11" });
  }
  if (!/\[Source\s+\d+\]\(https?:\/\//i.test(text) && !/\bClaimGraph|ClaimLedger|registry-backed|source-backed\b/i.test(text)) {
    issues.push({ code: "D11_not_grounded", message: "D11 has no citation or source-grounded reference", severity: "repair", divisionId: "D11" });
  }
  if (isTemplateD11(text)) issues.push({ code: "template_or_thin_d11", message: "template_or_thin_d11: D11 is generic template text", severity: "fatal", divisionId: "D11" });
  const score = Math.max(0, 15 - issues.length * 3);
  return { score, maxScore: 15, issues, metrics: { d11WordCount: wordCount(text), divisionReferences }, categoryScores: { strategicSynthesis: Math.min(10, score) } };
}

function isTemplateD11(text: string): boolean {
  const normalized = normalizeText(text);
  return normalized.length < 160
    || /^this is a short generic summary/.test(normalized)
    || /\bdiagnosis the decisive issue is whether the cited evidence supports\b/.test(normalized);
}
