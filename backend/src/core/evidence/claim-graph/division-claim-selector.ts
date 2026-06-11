import { tokenOverlapScore } from "./text.js";
import type { ClaimGraph, EvidenceClaim } from "./types.js";

export function selectDivisionClaims(graph: ClaimGraph, divisionId: string, divisionName: string, limit = 8): EvidenceClaim[] {
  const tokens = `${divisionId} ${divisionName}`.toLowerCase();
  const scored = graph.claims
    .map((claim) => ({ claim, score: relevanceScore(claim, tokens) }))
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.claim);
}

export function buildDivisionClaimGap(divisionName: string): string {
  return `Source gap: ClaimGraph found no relevant supported claims for ${divisionName}; use this division for POIs, limitations, or research gaps rather than unrelated evidence.`;
}

function relevanceScore(claim: EvidenceClaim, tokens: string): number {
  let score = Math.round((claim.supportScore ?? 0) * 0.55);
  score += Math.round(tokenOverlapScore(`${claim.text} ${(claim.bucketIds ?? []).join(" ")} ${claim.type}`, tokens) * 45);
  if (claim.mustUseCarefulLanguage) score -= 8;
  if (claim.validationStatus === "rejected") score -= 25;
  if ((claim.supportScore ?? 0) < 20) score -= 15;
  return score;
}
