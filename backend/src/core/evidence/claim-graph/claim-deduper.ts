import { classifyClaimType, carefulLanguageReason } from "./claim-type-classifier.js";
import { confidenceFromScore, scoreClaimSupport } from "./claim-support-scorer.js";
import { validateClaimSourceClasses } from "./claim-source-class-validator.js";
import { hasClaimOverlap, normalizeClaimText, stableClaimId } from "./text.js";
import type { EvidenceClaim, RawClaimInput } from "./types.js";

export function dedupeClaims(rawClaims: RawClaimInput[]): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  for (const raw of rawClaims.filter((claim) => claim.text.trim().length > 0)) {
    const existing = claims.find((claim) => hasClaimOverlap(claim.text, raw.text));
    if (existing) {
      mergeClaim(existing, raw);
      continue;
    }
    const claimType = classifyClaimType(raw);
    const carefulReason = carefulLanguageReason(claimType, raw.text);
    const claim: EvidenceClaim = {
      id: stableClaimId("claim", normalizeClaimText(raw.text), [raw.sourceId]),
      text: raw.text,
      type: claimType,
      claimType,
      requiredSourceClasses: [],
      supportingSourceIds: [raw.sourceId],
      confidence: raw.confidence,
      mustUseCarefulLanguage: Boolean(carefulReason) || raw.validationStatus === "rejected" || raw.extractionQuality === "snippet" || raw.extractionQuality === "title_only",
      forbiddenIfUnsupported: claimType === "score" || claimType === "rank" || claimType === "legal_holding" || /fraud|stolen|manipulat/i.test(raw.text),
      citationStrength: raw.citationStrength,
      sourceClasses: [raw.sourceClass],
      limitations: [raw.limitation].filter((value): value is string => Boolean(value?.trim())),
      validationStatus: raw.validationStatus,
      extractionQuality: raw.extractionQuality,
      requiresCarefulLanguageReason: carefulReason,
      sourceTrace: [{
        sourceId: raw.sourceId,
        sourceClass: raw.sourceClass,
        citationStrength: raw.citationStrength,
        extractionQuality: raw.extractionQuality,
        validationStatus: raw.validationStatus,
        usageType: raw.usageType,
        roleName: raw.roleName,
        evidenceSpan: raw.evidenceSpan,
        limitation: raw.limitation,
      }],
      normalizedText: normalizeClaimText(raw.text),
      bucketIds: raw.bucketIds,
    };
    claim.supportScore = scoreClaimSupport(claim);
    claim.confidence = confidenceFromScore(claim.supportScore);
    claims.push(validateClaimSourceClasses(claim));
  }
  return claims.map((claim) => {
    const supportScore = scoreClaimSupport(claim);
    return validateClaimSourceClasses({ ...claim, supportScore, confidence: confidenceFromScore(supportScore) });
  }).sort((a, b) => (b.supportScore ?? 0) - (a.supportScore ?? 0));
}

function mergeClaim(target: EvidenceClaim, raw: RawClaimInput): void {
  if (!target.supportingSourceIds.includes(raw.sourceId)) target.supportingSourceIds.push(raw.sourceId);
  target.sourceClasses = [...new Set([...(target.sourceClasses ?? []), raw.sourceClass])];
  target.bucketIds = [...new Set([...(target.bucketIds ?? []), ...(raw.bucketIds ?? [])])];
  if (raw.limitation?.trim()) target.limitations = [...new Set([...(target.limitations ?? []), raw.limitation])];
  target.sourceTrace = [...(target.sourceTrace ?? []), {
    sourceId: raw.sourceId,
    sourceClass: raw.sourceClass,
    citationStrength: raw.citationStrength,
    extractionQuality: raw.extractionQuality,
    validationStatus: raw.validationStatus,
    usageType: raw.usageType,
    roleName: raw.roleName,
    evidenceSpan: raw.evidenceSpan,
    limitation: raw.limitation,
  }];
  if (target.validationStatus !== "approved" && raw.validationStatus === "approved") target.validationStatus = "approved";
  if (target.extractionQuality !== "full" && raw.extractionQuality === "full") target.extractionQuality = "full";
  if (raw.text.length > target.text.length && target.text.length < 50) target.text = raw.text;
}
