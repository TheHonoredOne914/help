import type { EvidenceRegistryCore } from "../evidence-registry.js";
import { extractNumbers, extractRankValues, hasClaimOverlap } from "./text.js";
import type { ClaimGraph, UnsupportedClaimIssue } from "./types.js";

export function detectUnsupportedClaims(text: string, graph: ClaimGraph, registry: EvidenceRegistryCore): UnsupportedClaimIssue[] {
  const issues: UnsupportedClaimIssue[] = [];
  for (const rankValue of extractRankValues(text)) {
    if (!graph.claims.some((claim) => claim.type === "rank" && extractRankValues(claim.text).includes(rankValue))) {
      issues.push({ type: "unsupported_rank", claim: `rank ${rankValue}`, requiredValue: rankValue, action: "source_gap" });
    }
  }
  for (const scoreMatch of text.matchAll(/\bscore(?:d)?\s+(?:of\s+)?(\d+(?:\.\d+)?(?:\s?%)?)\b/gi)) {
    const value = scoreMatch[1].replace(/\s+/g, "");
    if (!graph.claims.some((claim) => claim.type === "score" && extractNumbers(claim.text).includes(value))) {
      issues.push({ type: "unsupported_score", claim: scoreMatch[0], requiredValue: value, action: "source_gap" });
    }
  }
  const caseNames = [...text.matchAll(/\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+v\.?\s+([A-Z][A-Za-z]+)\b/g)].map((match) => match[0]);
  for (const caseName of caseNames) {
    const graphSupported = graph.claims.some((claim) => claim.type === "legal_holding" && hasClaimOverlap(claim.text, caseName, 0.28));
    const registrySupported = registry.sources.some((source) => source.legalHoldings.some((holding) => holding.toLowerCase().includes(caseName.toLowerCase())) || source.title.toLowerCase().includes(caseName.toLowerCase()));
    if (!graphSupported && !registrySupported) issues.push({ type: "fake_judgment", claim: caseName, action: "hard_fail" });
  }
  if (/\bfraud happened|election was stolen|evms? were manipulated\b/i.test(text)) {
    const supported = graph.claims.some((claim) => /fraud|stolen|manipulat/i.test(claim.text) && (claim.supportScore ?? 0) >= 70);
    issues.push({ type: "unsupported_fraud_claim", claim: text, action: supported ? "qualify" : "hard_fail" });
  }
  for (const claim of graph.claims.filter((claim) => claim.forbiddenIfUnsupported && (claim.supportScore ?? 0) < 35)) {
    if (hasClaimOverlap(text, claim.text, 0.5)) {
      issues.push({ type: "unsupported_high_risk_claim", claim: claim.text, action: claim.mustUseCarefulLanguage ? "qualify" : "remove" });
    }
  }
  return issues;
}
