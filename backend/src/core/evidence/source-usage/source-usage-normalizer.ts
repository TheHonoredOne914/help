import type { EvidenceCard } from "../evidence-pack-builder.js";
import type { SourceUsageMapItem, SourceUsageType } from "./types.js";

export function normalizeSourceUsageItems(json: unknown, batch: EvidenceCard[]): SourceUsageMapItem[] {
  const rawItems = Array.isArray((json as any)?.sourceUsageMap) ? (json as any).sourceUsageMap : [];
  return rawItems.map((item: any): SourceUsageMapItem => {
    const card = batch.find((candidate) => candidate.sourceId === Number(item.sourceId));
    if (!card) {
      return {
        sourceId: Number(item.sourceId),
        title: cleanOptionalString(item.title) ?? "Unknown",
        bucketIds: [],
        sourceClass: "policy_research",
        usageType: normalizeUsageType(item.usageType),
        extractedClaim: cleanOptionalString(item.extractedClaim),
        extractedNumber: cleanOptionalString(item.extractedNumber),
        legalHolding: cleanOptionalString(item.legalHolding),
        limitation: cleanOptionalString(item.limitation),
        supportedSection: cleanOptionalString(item.supportedSection),
        confidence: normalizeConfidence(item.confidence, "low"),
        method: "model_extraction",
      };
    }
    return {
      sourceId: card.sourceId,
      title: card.title,
      bucketIds: card.bucketIds,
      sourceClass: card.sourceClass,
      usageType: normalizeUsageType(item.usageType),
      extractedClaim: cleanOptionalString(item.extractedClaim),
      extractedNumber: cleanOptionalString(item.extractedNumber),
      legalHolding: cleanOptionalString(item.legalHolding),
      limitation: cleanOptionalString(item.limitation),
      supportedSection: cleanOptionalString(item.supportedSection),
      confidence: normalizeConfidence(item.confidence, "medium"),
      method: "model_extraction",
    };
  });
}

function normalizeUsageType(value: unknown): SourceUsageType {
  const usageTypes: SourceUsageType[] = [
    "fact_extracted",
    "number_extracted",
    "legal_holding_extracted",
    "limitation_identified",
    "supports_claim",
    "challenges_claim",
    "used_for_reliability_matrix",
    "used_for_debate_utility",
    "used_for_citation_audit",
    "relevant_but_weak",
  ];
  return usageTypes.includes(value as SourceUsageType) ? value as SourceUsageType : "unknown_invalid";
}

function cleanOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeConfidence(value: unknown, fallback: "high" | "medium" | "low"): "high" | "medium" | "low" {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}
