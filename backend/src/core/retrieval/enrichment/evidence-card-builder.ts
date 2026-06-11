import type { EnrichedSource, EnrichmentEvidenceCard, EnrichmentEvidenceItem, ScoredChunk } from "./types.js";
import { computeCitationEligibility, isLimitedSource } from "./source-quality.js";
import { extractQueryTerms } from "./local-relevance-scorer.js";

export function buildEnrichmentCard(
  source: EnrichedSource,
  scoredChunks: ScoredChunk[],
  query: string,
  options: { evidenceItems?: EnrichmentEvidenceItem[]; reducerName?: "local" | "cerebras"; topK?: number } = {},
): EnrichmentEvidenceCard {
  if (!source.url?.trim()) throw new Error("Cannot build enrichment card without source URL");
  const topChunks = scoredChunks.slice(0, options.topK ?? 5);
  const queryTerms = extractQueryTerms(query);
  const keyTermsMatched = [...new Set(topChunks.flatMap((chunk) => chunk.keyTermsMatched ?? termsInText(chunk.text, queryTerms)))];
  const relevanceScore = Number((topChunks.reduce((sum, chunk) => sum + chunk.relevanceScore, 0) / Math.max(1, topChunks.length)).toFixed(3));
  const card: EnrichmentEvidenceCard = {
    sourceId: source.sourceId ?? 0,
    url: source.url,
    title: source.title || source.url,
    topChunks: topChunks.map((chunk) => chunk.text),
    evidenceItems: options.evidenceItems,
    citationEligible: false,
    limitedSource: isLimitedSource(source),
    relevanceScore,
    extractionQuality: source.extractionQuality,
    keyTermsMatched,
    citationStrength: "ineligible",
    reducerName: options.reducerName,
  };
  const eligibility = computeCitationEligibility(card);
  return { ...card, ...eligibility };
}

function termsInText(text: string, terms: Set<string>): string[] {
  const lower = text.toLowerCase();
  return [...terms].filter((term) => lower.includes(term));
}
