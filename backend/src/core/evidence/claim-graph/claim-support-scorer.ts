import type { EvidenceClaim } from "./types.js";

export function scoreClaimSupport(claim: EvidenceClaim): number {
  const trace = claim.sourceTrace ?? [];
  let score = 0;
  score += Math.min(35, claim.supportingSourceIds.length * 10);
  score += new Set(trace.map((item) => item.sourceClass)).size >= 2 ? 12 : 0;
  score += trace.some((item) => item.validationStatus === "approved") ? 18 : 0;
  // B18-22 FIX: empty sourceTrace must not get bonus ([].every() returns true)
  score += trace.length > 0 && trace.every((item) => item.validationStatus === "approved" || item.validationStatus === "registry_only") ? 8 : 0;
  score += trace.some((item) => item.citationStrength === "strong") ? 15 : trace.some((item) => item.citationStrength === "medium") ? 8 : 0;
  score += trace.some((item) => item.extractionQuality === "full" || item.extractionQuality === "partial") ? 8 : 0;
  score -= trace.some((item) => item.validationStatus === "rejected") ? 35 : 0;
  score -= trace.some((item) => item.extractionQuality === "snippet" || item.extractionQuality === "title_only") ? 20 : 0;
  score -= (claim.limitations?.length ?? 0) * 4;
  if (claim.mustUseCarefulLanguage) score -= 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function confidenceFromScore(score: number): EvidenceClaim["confidence"] {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
