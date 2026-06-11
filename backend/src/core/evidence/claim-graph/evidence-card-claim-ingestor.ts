import type { EvidencePack } from "../evidence-pack-builder.js";
import type { ClaimGraphBuildContext, ClaimValidationStatus, RawClaimInput } from "./types.js";

export function ingestEvidenceCardClaims(context: ClaimGraphBuildContext): RawClaimInput[] {
  const packs = context.options.evidencePacks ?? [];
  const raw: RawClaimInput[] = [];
  for (const pack of packs) {
    for (const card of pack.cards) {
      const validationStatus: ClaimValidationStatus = context.approvedSourceIds.has(card.sourceId)
        ? "approved"
        : context.rejectedSourceIds.has(card.sourceId)
          ? "rejected"
          : "contextual";
      const common = {
        sourceId: card.sourceId,
        sourceClass: card.sourceClass,
        citationStrength: card.citationStrength,
        extractionQuality: card.extractionQuality,
        confidence: card.citationStrength === "strong" ? "high" as const : card.citationStrength === "medium" ? "medium" as const : "low" as const,
        validationStatus,
        bucketIds: card.bucketIds,
        evidenceSpan: card.topChunks[0]?.text ?? card.contentPreview,
        limitation: card.limitations[0],
      };
      raw.push(...card.keyFacts.map((text) => ({ ...common, text })));
      raw.push(...card.keyNumbers.map((text) => ({ ...common, text, suggestedType: "score" as const })));
      raw.push(...card.legalHoldings.map((text) => ({
        ...common,
        text,
        suggestedType: "legal_holding" as const,
        confidence: card.extractionQuality === "snippet" || card.limitedSource ? "low" as const : common.confidence,
        limitation: card.extractionQuality === "snippet" ? "Snippet-only legal holding; use as context, not high-confidence doctrine." : common.limitation,
      })));
      for (const text of [card.governmentPosition, card.civilLibertiesPosition, card.electoralIntegrityPosition, card.debateUse, ...card.limitations]) {
        if (!text?.trim()) continue;
        raw.push({
          ...common,
          text,
          suggestedType: text === card.governmentPosition ? "official_position" : text === card.debateUse ? "debate_argument" : undefined,
        });
      }
    }
  }
  return raw;
}
