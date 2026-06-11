import { extractArticleMentions, validateLegalClaims } from "../verification/legal-claim-validator.js";
import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";

export function runLegalSafetyGate(ctx: QualityGateRuntimeInput): GateResult {
  const issues: QualityIssue[] = [];
  const report = validateLegalClaims(ctx.finalText, ctx.registry);
  for (const issue of report.criticalIssues ?? []) {
    issues.push({ code: "legal_accuracy", message: `legal_accuracy: ${issue}`, severity: "fatal" });
  }
  for (const warning of report.warnings ?? []) {
    issues.push({ code: "legal_accuracy_warning", message: `legal_accuracy: ${warning}`, severity: "warning" });
  }
  const legalLanguage = /\b(?:Supreme Court|High Court|judgment|holding|held that|ruled that|Article\s+\d+|unconstitutional|constitutional doctrine|statutory requirement|case law)\b/i.test(ctx.finalText);
  const articleMentions = extractArticleMentions(ctx.finalText);
  const graphLegalClaims = (ctx.input.claimGraph?.claims ?? []).filter((claim) => claim.type === "legal_holding");
  const ledgerLegalItems = (ctx.input.claimLedger?.items ?? []).filter((item) => item.legalHolding && item.evidenceSpan?.text);
  const hasVerifiedLegal = graphLegalClaims.length > 0 || ledgerLegalItems.length > 0 || articleMentions.length > 0;
  if (legalLanguage && !hasVerifiedLegal) {
    issues.push({ code: "legal_accuracy", message: "legal_accuracy: legal language has no verified Article, case, or ClaimLedger holding", severity: "fatal" });
  }
  const score = issues.some((issue) => issue.severity === "fatal") ? 0 : legalLanguage ? Math.min(10, 4 + articleMentions.length * 2 + graphLegalClaims.length * 2 + ledgerLegalItems.length * 2) : 6;
  return { score, maxScore: 10, issues, metrics: { legalClaimCount: graphLegalClaims.length + ledgerLegalItems.length, articleCount: articleMentions.length }, categoryScores: { legalAccuracy: score } };
}
