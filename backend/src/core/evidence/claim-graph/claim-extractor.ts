import type { EvidenceSource } from "../evidence-registry.js";
import type { ClaimGraphBuildContext, RawClaimInput } from "./types.js";

export function extractRegistryClaims(context: ClaimGraphBuildContext): RawClaimInput[] {
  return context.registry.sources.flatMap((source) => {
    const validationStatus = context.approvedSourceIds.has(source.id)
      ? "approved"
      : context.rejectedSourceIds.has(source.id)
        ? "rejected"
        : "registry_only";
    return [
      ...source.keyNumbers.map((text): RawClaimInput => base(source, text, validationStatus, "score")),
      ...source.legalHoldings.map((text): RawClaimInput => base(source, text, validationStatus, "legal_holding")),
      ...source.keyFacts.map((text): RawClaimInput => base(source, text, validationStatus)),
      ...source.limitations.map((text): RawClaimInput => ({ ...base(source, text, validationStatus), suggestedType: "interpretation", limitation: text })),
    ].filter((claim) => claim.text.trim().length > 0);
  });
}

function base(source: EvidenceSource, text: string, validationStatus: RawClaimInput["validationStatus"], suggestedType?: RawClaimInput["suggestedType"]): RawClaimInput {
  return {
    text,
    sourceId: source.id,
    sourceClass: source.sourceClass,
    citationStrength: source.citationStrength,
    extractionQuality: source.keyFacts.every((fact) => /^title-only relevance:/i.test(fact.trim())) ? "title_only" : source.extractionQuality,
    confidence: source.confidence,
    validationStatus,
    bucketIds: source.bucketIds,
    suggestedType,
    evidenceSpan: source.topChunks[0]?.text ?? source.fullText ?? source.snippet ?? undefined,
    limitation: source.limitations[0],
  };
}
