import { wordCount } from "./quality-gate-input.js";
import type { ModeQualityThresholds } from "./mode-thresholds.js";
import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";

/**
 * Final-answer length gate.
 *
 * Per LOVABLE_RESEARCH_MODE_REQUIREMENTS_AND_FIX_BRIEF.md §9
 * ("Final Output Too Short or Not Bullet-Prioritized"):
 *   - Fast Research must produce >= 1000 words.
 *   - Deep Research must produce 2000-3000 words.
 *   - Council must produce 3000-5500 words.
 *
 * Below min     -> issue "final_answer_too_short" (severity "repair") ->
 *                  triggers length_repair (cited bullets from EvidencePacks).
 * Above max     -> issue "final_answer_too_long"  (severity "repair") ->
 *                  triggers length_trim_repair (deterministic safe truncation).
 *
 * If repair cannot bring length into range, repairRequired stays true and
 * decideFinalResearchStatus marks the run "failed" rather than "completed".
 * No threshold is weakened; both bounds are enforced honestly.
 */
export function runFinalAnswerLengthGate(
  ctx: QualityGateRuntimeInput,
  thresholds: ModeQualityThresholds,
): GateResult {
  const minWords = thresholds.finalAnswerMinWords ?? 0;
  const maxWords = thresholds.finalAnswerMaxWords ?? 0;
  if (minWords <= 0 && maxWords <= 0) {
    return { score: 5, maxScore: 5, issues: [], categoryScores: { finalAnswerLength: 5 } };
  }

  const actualWords = wordCount(ctx.finalText ?? "");
  const issues: QualityIssue[] = [];

  if (minWords > 0 && actualWords < minWords) {
    issues.push({
      code: "final_answer_too_short",
      message: `final_answer_too_short: ${actualWords} words < required ${minWords} for mode ${ctx.input.mode}`,
      severity: "repair",
    });
  }

  if (maxWords > 0 && actualWords > maxWords) {
    issues.push({
      code: "final_answer_too_long",
      message: `final_answer_too_long: ${actualWords} words > allowed ${maxWords} for mode ${ctx.input.mode}`,
      severity: "repair",
    });
  }

  // Score 5/5 inside range; otherwise scale linearly to how close we are.
  let ratio = 1;
  if (minWords > 0 && actualWords < minWords) ratio = actualWords / minWords;
  else if (maxWords > 0 && actualWords > maxWords) ratio = maxWords / actualWords;
  ratio = Math.max(0, Math.min(1, ratio));

  return {
    score: Math.round(ratio * 5),
    maxScore: 5,
    issues,
    categoryScores: { finalAnswerLength: Math.round(ratio * 10) },
  };
}
