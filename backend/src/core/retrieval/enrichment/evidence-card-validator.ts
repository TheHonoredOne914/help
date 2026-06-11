import type { EnrichmentEvidenceCard, EnrichmentEvidenceItem, SourceChunk, ValidationResult } from "./types.js";

export function validateEvidenceCard(card: EnrichmentEvidenceCard, originalChunks: SourceChunk[]): ValidationResult {
  const invalidChunks: number[] = [];
  const verifiedChunks: number[] = [];
  card.topChunks.forEach((chunk, index) => {
    if (isVerified(chunk, originalChunks)) verifiedChunks.push(index);
    else invalidChunks.push(index);
  });
  return {
    valid: invalidChunks.length === 0,
    invalidChunks,
    verifiedChunks,
  };
}

export function pruneInvalidEvidenceCardChunks(card: EnrichmentEvidenceCard, originalChunks: SourceChunk[]): EnrichmentEvidenceCard {
  const topChunks = card.topChunks.filter((chunk) => isVerified(chunk, originalChunks));
  const evidenceItems = card.evidenceItems?.filter((item) => isEvidenceItemVerified(item, originalChunks));
  return {
    ...card,
    topChunks,
    evidenceItems,
  };
}

export function isEvidenceItemVerified(item: EnrichmentEvidenceItem, originalChunks: SourceChunk[]): boolean {
  return isVerified(item.snippet, originalChunks) || isVerified(item.claim, originalChunks);
}

function isVerified(value: string, originalChunks: SourceChunk[]): boolean {
  const normalized = normalize(value);
  if (!normalized) return false;
  return originalChunks.some((chunk) => {
    const source = normalize(chunk.text);
    if (source.includes(normalized) || normalized.includes(source)) return true;
    return overlapRatio(normalized, source) >= 0.85;
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function overlapRatio(value: string, source: string): number {
  const tokens = value.match(/[a-z0-9]+/g) ?? [];
  if (tokens.length === 0) return 0;
  const sourceTokens = new Set(source.match(/[a-z0-9]+/g) ?? []);
  const overlap = tokens.filter((token) => sourceTokens.has(token)).length;
  return overlap / tokens.length;
}
