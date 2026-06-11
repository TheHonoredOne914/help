import { normalizeText } from "./quality-gate-input.js";
import type { GateResult, QualityGateRuntimeInput } from "./types.js";
import type { ModeQualityThresholds } from "./mode-thresholds.js";

export function runClaimGroundingGate(ctx: QualityGateRuntimeInput, thresholds: ModeQualityThresholds): GateResult {
  const issues = [];
  const graph = ctx.input.claimGraph;
  const ledger = ctx.input.claimLedger;
  const graphClaims = graph?.claims ?? [];
  const ledgerItems = ledger?.items ?? [];
  const approvedLedgerSourceIds = new Set(ledgerItems.filter((item) => item.citationCreditEligible !== false && item.evidenceSpan?.text).map((item) => item.sourceId));
  const graphSourceIds = new Set(graphClaims.flatMap((claim) => claim.supportingSourceIds ?? []));
  const cited = ctx.input.uniqueCitedSourceIds;
  const groundedCitations = cited.filter((id) => approvedLedgerSourceIds.has(id) || graphSourceIds.has(id)).length;
  const highRiskUnsupported = (graph?.unsupportedClaims ?? []).filter((issue) => issue.action === "hard_fail" || /fraud|judgment|rank|score/i.test(issue.type));

  if (thresholds.requireClaimGrounding) {
    if (graphClaims.length === 0 || ledgerItems.length === 0) {
      issues.push({ code: "claim_grounding_traceability", message: "claim_grounding_traceability: ClaimGraph and ClaimLedger support is missing", severity: "fatal" as const });
    } else if (groundedCitations < Math.min(thresholds.minCitedSources, cited.length)) {
      issues.push({ code: "claim_grounding_traceability", message: "claim_grounding_traceability: cited sources do not map to approved ClaimGraph/ClaimLedger evidence", severity: "fatal" as const });
    }
  }

  for (const issue of highRiskUnsupported) {
    issues.push({ code: "unsupported_high_risk_claim", message: `unsupported_high_risk_claim: ${issue.claim}`, severity: "fatal" as const });
  }

  const textTokens = normalizeText(ctx.finalText);
  const unsupportedFraud = /\b(secretly invalidated|every court confirmed the fraud|forty million votes|votes were stolen)\b/i.test(ctx.finalText);
  if (unsupportedFraud && !graphClaims.some((claim) => textTokens.includes(normalizeText(claim.text)))) {
    issues.push({ code: "claim_grounding_traceability", message: "claim_grounding_traceability: high-risk final claim has no graph support", severity: "fatal" as const });
  }

  const ratio = cited.length ? groundedCitations / cited.length : 0;
  const score = thresholds.requireClaimGrounding ? Math.round(15 * ratio) : 12;
  return {
    score: Math.min(15, score),
    maxScore: 15,
    issues,
    metrics: {
      graphClaimCount: graphClaims.length,
      ledgerItemCount: ledgerItems.length,
      groundedCitationCount: groundedCitations,
    },
    categoryScores: { claimGrounding: Math.min(15, score) },
  };
}
