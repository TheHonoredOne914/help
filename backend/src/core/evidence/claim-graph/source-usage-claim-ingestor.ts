import type { EvidenceSource } from "../evidence-registry.js";
import type { ClaimGraphBuildContext, RawClaimInput } from "./types.js";

export function ingestSourceUsageClaims(context: ClaimGraphBuildContext): RawClaimInput[] {
  const raw: RawClaimInput[] = [];
  for (const output of context.options.modelRoleOutputs ?? []) {
    for (const item of output.sourceUsageMap) {
      const source = context.registry.getSource(item.sourceId);
      if (!source) continue;
      const text = extractUsageText(item);
      if (!text) continue;
      const validationStatus = context.approvedSourceIds.has(item.sourceId)
        ? "approved"
        : context.rejectedSourceIds.has(item.sourceId)
          ? "rejected"
          : "contextual";
      raw.push({
        text,
        sourceId: source.id,
        sourceClass: source.sourceClass,
        citationStrength: item.citationStrength ?? source.citationStrength,
        extractionQuality: item.evidenceSpan?.extractionQuality ?? source.extractionQuality,
        confidence: item.confidence,
        validationStatus,
        usageType: item.usageType,
        roleName: output.roleName,
        supportedSection: item.supportedSection,
        limitation: item.limitation ?? source.limitations[0],
        evidenceSpan: item.evidenceSpan?.text ?? evidenceSpanFallback(source),
        bucketIds: item.bucketIds.length ? item.bucketIds : source.bucketIds,
        suggestedType: item.usageType === "number_extracted" ? "score" : item.usageType === "legal_holding_extracted" ? "legal_holding" : undefined,
        fromCounterclaim: item.usageType === "challenges_claim",
      });
    }
  }
  return raw;
}

function extractUsageText(item: { extractedClaim?: string; legalHolding?: string; extractedNumber?: string; supportedSection?: string; limitation?: string }): string {
  return [item.extractedClaim, item.legalHolding, item.extractedNumber, item.supportedSection, item.limitation]
    .find((value) => Boolean(value?.trim()))?.trim() ?? "";
}

function evidenceSpanFallback(source: EvidenceSource): string | undefined {
  return source.topChunks[0]?.text ?? source.keyFacts[0] ?? source.legalHoldings[0] ?? source.keyNumbers[0] ?? source.fullText ?? source.snippet ?? undefined;
}
