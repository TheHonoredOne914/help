import type { EvidenceSource } from "../evidence-registry.js";
import type { EvidenceCard } from "./types.js";

const STOP_WORDS = new Set([
  "about",
  "after",
  "against",
  "also",
  "and",
  "are",
  "from",
  "have",
  "india",
  "indian",
  "into",
  "issue",
  "parliament",
  "source",
  "that",
  "the",
  "this",
  "with",
]);

export function scoreQueryRelevance(card: EvidenceCard | EvidenceSource, query = ""): number {
  const terms = extractQueryTerms(query);
  if (terms.size === 0) return Math.min(100, Math.max(0, "relevanceScore" in card ? card.relevanceScore : card.authorityScore));
  const text = searchableText(card);
  const tokens = new Set(tokenize(text));
  let hits = 0;
  let partialHits = 0;
  for (const term of terms) {
    if (tokens.has(term)) hits += 1;
    else if ([...tokens].some((token) => token.startsWith(term) || term.startsWith(token))) partialHits += 1;
  }
  const overlap = (hits + partialHits * 0.5) / Math.max(1, terms.size);
  const phraseBonus = phraseMatches(query, text) * 4;
  const chunkBonus = "topChunks" in card ? Math.min(18, card.topChunks.reduce((sum, chunk) => sum + Math.max(0, chunk.score), 0) / 2) : 0;
  const entityBonus = "namedEntities" in card ? Math.min(10, card.namedEntities.filter((entity) => query.toLowerCase().includes(entity.toLowerCase())).length * 5) : 0;
  return Math.max(0, Math.min(100, Math.round(overlap * 74 + phraseBonus + chunkBonus + entityBonus)));
}

export function extractQueryTerms(query: string): Set<string> {
  return new Set(tokenize(query).filter((term) => term.length >= 4 && !STOP_WORDS.has(term)));
}

function searchableText(card: EvidenceCard | EvidenceSource): string {
  const authorityText = "authorityScore" in card
    ? [card.fullText, card.snippet]
    : [card.contentPreview, card.debateUse];
  return [
    card.title,
    card.url,
    card.sourceClass,
    ...card.bucketIds,
    ...card.keyFacts,
    ...card.keyNumbers,
    ...card.legalHoldings,
    ...card.limitations,
    ...card.namedEntities,
    ...card.topChunks.map((chunk) => chunk.text),
    ...authorityText,
  ].filter((value): value is string => Boolean(value?.trim())).join(" ");
}

function phraseMatches(query: string, text: string): number {
  const lower = text.toLowerCase();
  const phrases = [
    "supreme court",
    "election commission",
    "article 19",
    "article 21",
    "electoral bonds",
    "union ministry",
    "treasury bench",
    "opposition",
    "public order",
    "national security",
  ].filter((phrase) => query.toLowerCase().includes(phrase));
  return phrases.filter((phrase) => lower.includes(phrase)).length;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/s$/, ""))
    .filter(Boolean);
}
