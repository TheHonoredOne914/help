import type { EvidenceSource } from "../evidence-registry.js";
import type { CitationStrength, ExtractionQuality, SourceClass } from "../evidence-registry-types.js";
import type { EvidenceCard } from "./types.js";

const CITATION_STRENGTH_RANK: Record<CitationStrength, number> = {
  strong: 4,
  medium: 3,
  weak: 2,
  ineligible: 0,
};

const EXTRACTION_QUALITY_RANK: Record<ExtractionQuality, number> = {
  full: 4,
  partial: 3,
  snippet: 1,
  failed: 0,
};

const PRIMARY_SOURCE_CLASSES = new Set<SourceClass>([
  "court_primary",
  "official_government",
  "parliamentary_records",
  "electoral_body",
]);

const CREDIBLE_SOURCE_CLASSES = new Set<SourceClass>([
  "indian_major_media",
  "academic_journal",
  "legal_commentary",
  "policy_research",
  "democracy_index",
  "human_rights_watchdog",
  "digital_rights_watchdog",
  "press_freedom_index",
  "civic_space_monitor",
  "comparative_democracy",
]);

export function citationStrengthRank(strength: CitationStrength): number {
  return CITATION_STRENGTH_RANK[strength] ?? 0;
}

export function extractionQualityRank(quality: ExtractionQuality): number {
  return EXTRACTION_QUALITY_RANK[quality] ?? 0;
}

export function citationStrengthBonus(strength: CitationStrength): number {
  if (strength === "strong") return 14;
  if (strength === "medium") return 9;
  if (strength === "weak") return 1;
  return -30;
}

export function sourceClassBaseBonus(sourceClass: SourceClass): number {
  if (PRIMARY_SOURCE_CLASSES.has(sourceClass)) return 10;
  if (CREDIBLE_SOURCE_CLASSES.has(sourceClass)) return 5;
  if (sourceClass === "social_media") return -18;
  if (sourceClass === "low_quality") return -25;
  return 0;
}

export function evidenceQualityScore(card: Pick<EvidenceCard, "citationStrength" | "extractionQuality" | "limitedSource" | "relevanceScore" | "topChunks" | "keyFacts" | "keyNumbers" | "legalHoldings">): number {
  return citationStrengthRank(card.citationStrength) * 100
    + extractionQualityRank(card.extractionQuality) * 25
    + Math.min(20, Math.max(0, card.relevanceScore) / 5)
    + Math.min(15, card.topChunks.reduce((sum, chunk) => sum + Math.max(0, chunk.score), 0))
    + Math.min(12, (card.keyFacts.length + card.keyNumbers.length + card.legalHoldings.length) * 3)
    - (card.limitedSource ? 35 : 0);
}

export function sourceQualityScore(source: EvidenceSource): number {
  return citationStrengthRank(source.citationStrength) * 100
    + extractionQualityRank(source.extractionQuality) * 25
    + Math.min(20, Math.max(0, source.authorityScore) / 5)
    + Math.min(15, source.topChunks.reduce((sum, chunk) => sum + Math.max(0, chunk.score), 0))
    + Math.min(12, (source.keyFacts.length + source.keyNumbers.length + source.legalHoldings.length) * 3)
    - (source.limitedSource ? 35 : 0);
}

export function compareEvidenceQuality(a: EvidenceCard, b: EvidenceCard): number {
  return evidenceQualityScore(b) - evidenceQualityScore(a)
    || (b.queryRelevanceScore ?? 0) - (a.queryRelevanceScore ?? 0)
    || b.relevanceScore - a.relevanceScore
    || a.sourceId - b.sourceId;
}

export function hasUsableEvidence(card: Pick<EvidenceCard, "keyFacts" | "keyNumbers" | "legalHoldings" | "topChunks" | "contentPreview" | "debateUse" | "title">): boolean {
  const values = [
    ...card.keyFacts,
    ...card.keyNumbers,
    ...card.legalHoldings,
    ...card.topChunks.map((chunk) => chunk.text),
    card.contentPreview,
    card.debateUse,
  ].filter((value): value is string => Boolean(value?.trim()));
  return values.some((value) => {
    const text = value.trim();
    return text.length >= 12
      && !/^title-only relevance:/i.test(text)
      && !/^use only as background context/i.test(text)
      && text.toLowerCase() !== card.title.trim().toLowerCase();
  });
}
