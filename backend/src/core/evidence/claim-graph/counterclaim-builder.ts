import { hasClaimOverlap, stableClaimId } from "./text.js";
import type { ClaimCounterclaim, EvidenceClaim, RawClaimInput } from "./types.js";

export function buildCounterclaims(rawClaims: RawClaimInput[], claims: EvidenceClaim[]): ClaimCounterclaim[] {
  return rawClaims
    .filter((raw) => raw.fromCounterclaim || raw.usageType === "challenges_claim" || isCounterclaimSource(raw))
    .map((raw) => {
      const challenged = claims.find((claim) => claim.supportingSourceIds.some((id) => id !== raw.sourceId) && hasClaimOverlap(claim.text, raw.text, 0.35));
      return {
        id: stableClaimId("counterclaim", raw.text, [raw.sourceId]),
        text: raw.text,
        challengedClaimId: challenged?.id,
        sourceIds: [raw.sourceId],
        sourceClasses: [raw.sourceClass],
        supportScore: Math.max(10, Math.min(80, challenged ? (challenged.supportScore ?? 30) - 5 : 35)),
        requiresCarefulLanguage: raw.validationStatus !== "approved" || /alleg|claim|watchdog|concern|critic/i.test(raw.text),
        limitation: raw.limitation,
      };
    });
}

export function attachCounterclaims(claims: EvidenceClaim[], counterclaims: ClaimCounterclaim[]): EvidenceClaim[] {
  return claims.map((claim) => ({
    ...claim,
    counterclaimIds: counterclaims.filter((counterclaim) => counterclaim.challengedClaimId === claim.id).map((counterclaim) => counterclaim.id),
  }));
}

function isCounterclaimSource(raw: RawClaimInput): boolean {
  return /watchdog|rights|press|civic/.test(raw.sourceClass) && /\bconcern|critic|challenge|alleg|violation|risk|lack\b/i.test(raw.text);
}
