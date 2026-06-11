import type { GateResult, QualityGateRuntimeInput } from "./types.js";

export function runFallbackQualityGate(ctx: QualityGateRuntimeInput): GateResult {
  const issues = [];
  const fallbackStatus = ctx.input.fallbackStatus;
  const template = /\btemplate answer\b|\bfallback answer\b|\bunable to generate\b|\bCore generation could not produce\b|\bResearch Incomplete\b/i.test(ctx.finalText);
  if (fallbackStatus && fallbackStatus !== "none") {
    issues.push({ code: "fallback_enforced", message: `${fallbackStatus}: fallback output cannot be normal completed output`, severity: "fatal" as const });
  }
  if (template) {
    issues.push({ code: "deterministic_fallback_template", message: "deterministic_fallback_template: template/fallback answer pretending to be thesis output", severity: "fatal" as const });
  }
  return { score: issues.length ? 0 : 5, maxScore: 5, issues };
}
