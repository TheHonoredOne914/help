import type { EvidenceCard } from "../evidence-pack-builder.js";
import type { EvidenceSource } from "../evidence-registry.js";
import type { SourceUsageMapItem } from "./types.js";

export function buildDeterministicUsageItems(cards: EvidenceCard[], minimum: number): SourceUsageMapItem[] {
  return cards.slice(0, Math.max(minimum, 0)).map((card) => usageItemFromCard(card));
}

export function buildDeterministicUsageItemFromSource(source: EvidenceSource): SourceUsageMapItem {
  const fact = firstMeaningful([
    ...source.keyFacts,
    ...source.topChunks.map((chunk) => chunk.text),
    source.snippet,
    source.fullText,
  ]);
  const number = firstMeaningful(source.keyNumbers);
  const legalHolding = firstMeaningful(source.legalHoldings);
  const limitation = source.limitations[0];
  if (number && isSubstantiveNumber(number) && (fact || source.bucketIds[0])) {
    return baseSourceItem(source, {
      usageType: "number_extracted",
      extractedNumber: number,
      extractedClaim: fact,
      supportedSection: fact ? undefined : source.bucketIds[0],
      limitation,
      confidence: source.confidence === "high" ? "medium" : source.confidence,
    });
  }
  if (legalHolding && ["court_primary", "legal_commentary"].includes(source.sourceClass)) {
    return baseSourceItem(source, {
      usageType: "legal_holding_extracted",
      legalHolding,
      limitation,
      confidence: source.confidence === "high" ? "medium" : source.confidence,
    });
  }
  if (fact && isDeterministicCountCandidate(source)) {
    return baseSourceItem(source, {
      usageType: "fact_extracted",
      extractedClaim: fact,
      limitation,
      confidence: source.confidence === "high" ? "medium" : source.confidence,
    });
  }
  return baseSourceItem(source, {
    usageType: "relevant_but_weak",
    limitation: limitation ?? "Only weak, limited, or title-only background text was available for deterministic extraction.",
    confidence: "low",
  });
}

function isDeterministicCountCandidate(source: EvidenceSource): boolean {
  if (source.extractionQuality === "snippet" || source.extractionQuality === "failed") return false;
  if (source.citationStrength === "strong" || source.citationStrength === "medium") return true;
  return Boolean(source.fullText?.trim())
    && source.authorityScore >= 65
    && source.keyFacts.some((fact) => fact.trim() && !/^title-only relevance:/i.test(fact.trim()));
}

function usageItemFromCard(card: EvidenceCard): SourceUsageMapItem {
  const fact = firstMeaningful([card.contentPreview, ...card.keyFacts, card.debateUse]);
  const number = firstMeaningful(card.keyNumbers);
  const legalHolding = firstMeaningful(card.legalHoldings);
  const debateUse = firstMeaningful([card.debateUse]);
  const weak = !isCardCountCandidate(card);
  if (number && isSubstantiveNumber(number) && (fact || card.usableSections[0]) && !weak) {
    return baseCardItem(card, {
      usageType: "number_extracted",
      extractedNumber: number,
      extractedClaim: fact,
      supportedSection: fact ? undefined : card.usableSections[0],
      limitation: card.limitations[0],
      confidence: "low",
    });
  }
  if (legalHolding && ["court_primary", "legal_commentary"].includes(card.sourceClass) && !weak) {
    return baseCardItem(card, {
      usageType: "legal_holding_extracted",
      legalHolding,
      limitation: card.limitations[0],
      confidence: "low",
    });
  }
  if (fact && !weak) {
    return baseCardItem(card, {
      usageType: "fact_extracted",
      extractedClaim: fact,
      limitation: card.limitations[0],
      confidence: "low",
    });
  }
  if (debateUse && !sameText(debateUse, card.title) && !/^use only as background context/i.test(debateUse) && !weak) {
    return baseCardItem(card, {
      usageType: "used_for_debate_utility",
      extractedClaim: debateUse,
      supportedSection: card.usableSections[0],
      limitation: card.limitations[0],
      confidence: "low",
    });
  }
  return baseCardItem(card, {
    usageType: "relevant_but_weak",
    limitation: card.limitations[0] ?? "Only weak or title-only background text was available for deterministic extraction.",
    confidence: "low",
  });
}

function isCardCountCandidate(card: EvidenceCard): boolean {
  if (card.extractionQuality === "snippet" || card.extractionQuality === "failed") return false;
  if (card.citationStrength === "strong" || card.citationStrength === "medium") return true;
  return Boolean(card.contentPreview?.trim())
    && card.relevanceScore >= 65
    && card.keyFacts.some((fact) => fact.trim() && !/^title-only relevance:/i.test(fact.trim()));
}

function baseCardItem(card: EvidenceCard, fields: Pick<SourceUsageMapItem, "usageType" | "confidence"> & Partial<SourceUsageMapItem>): SourceUsageMapItem {
  return {
    sourceId: card.sourceId,
    title: card.title,
    bucketIds: card.bucketIds,
    sourceClass: card.sourceClass,
    method: "deterministic_extraction",
    ...fields,
  };
}

function baseSourceItem(source: EvidenceSource, fields: Pick<SourceUsageMapItem, "usageType" | "confidence"> & Partial<SourceUsageMapItem>): SourceUsageMapItem {
  return {
    sourceId: source.id,
    title: source.title,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    method: "deterministic_extraction",
    ...fields,
  };
}

function firstMeaningful(values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    if (/^title-only relevance:/i.test(text)) continue;
    if (/cookie|subscribe|advertisement|privacy policy|navigation/i.test(text)) continue;
    const sentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text;
    if (sentence.length >= 8) return sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}...` : sentence;
  }
  return undefined;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isSubstantiveNumber(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/%|,|\.\d/.test(text)) return true;
  return false;
}
