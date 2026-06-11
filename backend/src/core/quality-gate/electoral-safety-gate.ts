import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";

const UNSAFE_ELECTORAL_PATTERNS = [
  /\belection(?:s)?\s+was\s+rigged\b/i,
  /\belection(?:s)?\s+were\s+rigged\b/i,
  /\bEVMs?\s+were\s+compromised\b/i,
  /\belectoral\s+fraud\s+is\s+established\b/i,
  /\bcounting\s+was\s+manipulated\b/i,
  /\bEVMs?\s+cannot\s+be\s+trusted\b/i,
  /\bresults\s+were\s+stolen\b/i,
  /\belection\s+was\s+stolen\b/i,
  /\bfraud happened\b/i,
  /(?<!allegations of )\bEVMs?\s+were\s+(?:manipulated|hacked)\b/i,
];

export function runElectoralSafetyGate(ctx: QualityGateRuntimeInput): GateResult {
  const issues: QualityIssue[] = [];
  const electoralTopic = /\belection|electoral|evm|vvpat|eci|election commission\b/i.test(ctx.contract.originalUserQuery);
  const discussesElection = /\belection|electoral|evm|vvpat|eci|election commission\b/i.test(ctx.finalText);
  if (UNSAFE_ELECTORAL_PATTERNS.some((pattern) => pattern.test(ctx.finalText))) {
    issues.push({ code: "electoral_integrity", message: "electoral_integrity: unsupported electoral fraud proof language", severity: "fatal" });
  }
  if ((ctx.input.claimGraph?.claims ?? []).some((claim) => claim.type === "allegation" && /fraud|rigged|stolen|evm/i.test(claim.text) && claim.forbiddenIfUnsupported)) {
    issues.push({ code: "electoral_integrity", message: "electoral_integrity: ClaimGraph marks electoral allegation as unsupported", severity: "fatal" });
  }
  const cautious = /\balleg(?:e|ation)|petition|eci (?:responded|defence|defense)|court held|evidence threshold|not proven|requires proof\b/i.test(ctx.finalText);
  if (electoralTopic && !discussesElection) {
    return { score: 3, maxScore: 10, issues: [{ code: "electoral_integrity_absent", message: "electoral_integrity: electoral topic lacks electoral caution discussion", severity: "warning" }], categoryScores: { electoralCaution: 3 } };
  }
  return { score: issues.length ? 0 : cautious ? 10 : electoralTopic ? 6 : 8, maxScore: 10, issues, categoryScores: { electoralCaution: issues.length ? 0 : cautious ? 10 : electoralTopic ? 6 : 8 } };
}
