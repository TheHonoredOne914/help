import type { ClaimGraph } from "../evidence/claim-graph.js";
import type { ClaimLedger } from "../evidence/claim-ledger.js";
import { validateElectoralIntegrityLanguage } from "../verification/electoral-integrity-guard.js";
import { extractArticleMentions, validateLegalClaims } from "../verification/legal-claim-validator.js";
import { validateIndianParliamentFraming } from "../verification/indian-parliament-framing-guard.js";
import { wordCount } from "./quality-gate-input.js";
import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";

const PARLIAMENT_TERMS = /\b(Treasury Bench|Opposition|Lok Sabha|Rajya Sabha|AIPPM|committee|Union ministry|Supreme Court|Election Commission|federalism|motion|amendment|POI|rebuttal|floor strategy|parliamentary question)\b/gi;
const UN_TERMS = /\b(member states|UN resolution|Security Council|General Assembly|ECOSOC|international community must|bloc politics)\b/gi;

/**
 * Single safety validation pass: legal accuracy, electoral integrity, and Indian parliamentary framing.
 * Replaces the former legal-safety, electoral-safety, and parliament-framing sub-gates.
 */
export function runSafetyQualityGate(ctx: QualityGateRuntimeInput): GateResult {
  const issues: QualityIssue[] = [];
  const legalReport = validateLegalClaims(ctx.finalText, ctx.registry, {
    claimGraph: ctx.input.claimGraph ?? undefined,
    claimLedger: ctx.input.claimLedger ?? undefined,
  });
  for (const issue of legalReport.criticalIssues ?? []) {
    issues.push({ code: "legal_accuracy", message: `legal_accuracy: ${issue}`, severity: "fatal" });
  }
  for (const warning of legalReport.warnings ?? []) {
    issues.push({ code: "legal_accuracy_warning", message: `legal_accuracy: ${warning}`, severity: "warning" });
  }

  const electoralReport = validateElectoralIntegrityLanguage(ctx.finalText, {
    originalUserQuery: ctx.contract.originalUserQuery,
    claimGraph: ctx.input.claimGraph ?? undefined,
  });
  for (const issue of electoralReport.issues) {
    issues.push({
      code: "electoral_integrity",
      message: issue.startsWith("electoral_integrity:") ? issue : `electoral_integrity: ${issue}`,
      severity: electoralReport.passed ? "warning" : "fatal",
    });
  }

  const framingReport = validateIndianParliamentFraming(ctx.finalText, {
    committeeSystem: ctx.contract.committeeSystem,
  });
  for (const issue of framingReport.issues) {
    // A single UN phrase is not fatal on its own; dominance below decides takeover.
    if (/UN-style framing detected/i.test(issue)) continue;
    issues.push({
      code: "parliament_framing",
      message: issue.startsWith("parliament_framing:") ? issue : `parliament_framing: ${issue}`,
      severity: "fatal",
    });
  }

  const parliamentHits = (ctx.finalText.match(PARLIAMENT_TERMS) ?? []).length;
  const unHits = (ctx.finalText.match(UN_TERMS) ?? []).length;
  const totalWords = Math.max(1, wordCount(ctx.finalText));
  const densityPer500 = parliamentHits / (totalWords / 500);
  const unFramingDominates = unHits > 0 && unHits >= parliamentHits;
  if (ctx.contract.committeeSystem === "indian_mock_parliament" && unFramingDominates) {
    issues.push({ code: "parliament_framing", message: "parliament_framing: UN framing takeover detected or dominates", severity: "fatal" });
  }
  if (ctx.contract.committeeSystem === "indian_mock_parliament" && densityPer500 < 3) {
    issues.push({ code: "parliament_framing", message: "parliament_framing: Indian parliamentary signal density is too weak", severity: "fatal" });
  }

  const legalScore = issues.some((issue) => issue.code === "legal_accuracy" && issue.severity === "fatal")
    ? 0
    : /\b(?:Supreme Court|High Court|judgment|holding|held that|ruled that|Article\s+\d+|unconstitutional|constitutional doctrine|statutory requirement|case law)\b/i.test(ctx.finalText)
      ? Math.min(10, 4 + extractArticleMentions(ctx.finalText).length * 2 + countLegalClaims(ctx.input.claimGraph, ctx.input.claimLedger))
      : 6;
  const electoralScore = issues.some((issue) => issue.code === "electoral_integrity" && issue.severity === "fatal")
    ? 0
    : electoralReport.categoryScore;
  const framingScore = issues.some((issue) => issue.code === "parliament_framing" && issue.severity === "fatal")
    ? Math.max(0, 10 - issues.filter((issue) => issue.code === "parliament_framing").length * 4)
    : 10;

  return {
    score: Math.round((legalScore + electoralScore + framingScore) / 3),
    maxScore: 10,
    issues,
    metrics: { parliamentHits, unHits, densityPer500 },
    categoryScores: {
      legalAccuracy: legalScore,
      electoralCaution: electoralScore,
      indianParliamentFraming: framingScore,
    },
  };
}

function countLegalClaims(claimGraph?: ClaimGraph | null, claimLedger?: ClaimLedger | null): number {
  const graphLegalClaims = (claimGraph?.claims ?? []).filter((claim) => claim.type === "legal_holding").length;
  const ledgerLegalItems = (claimLedger?.items ?? []).filter((item) => item.legalHolding && item.evidenceSpan?.text).length;
  return graphLegalClaims + ledgerLegalItems;
}
