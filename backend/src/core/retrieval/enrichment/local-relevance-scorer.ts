import type { ScoredChunk, SourceChunk } from "./types.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "about", "india", "indian",
  "source", "official", "article", "court", "parliament",
]);

const INDIAN_ENTITY_PATTERN = /\b(Supreme Court|Parliament|Lok Sabha|Rajya Sabha|Vidhan Sabha|Article\s+\d+[A-Z]?|Ministry|Union|Election Commission|Treasury Bench|Opposition)\b/i;
const LEGAL_HOLDING_PATTERN = /\b(held|ruled|judgment|doctrine|constitutional|proportionality|rights?|federalism|public order|national security)\b/i;
const BOILERPLATE_PATTERN = /\b(cookie|subscribe|newsletter|advertisement|privacy policy|share this|sign in|login|navigation|footer)\b/i;

export function extractQueryTerms(query: string): Set<string> {
  const terms = new Set<string>();
  for (const match of query.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (match.length < 2) continue;
    if (STOPWORDS.has(match) && !/^\d+$/.test(match)) continue;
    terms.add(match);
  }
  return terms;
}

export function scoreChunks(chunks: SourceChunk[], queryTerms: Set<string>): ScoredChunk[] {
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, chunks.filter((chunk) => chunk.text.toLowerCase().includes(term)).length);
  }

  return chunks
    .map((chunk): ScoredChunk => {
      const lower = chunk.text.toLowerCase();
      const matchedTerms: string[] = [];
      let relevanceScore = 0;
      for (const term of queryTerms) {
        const matches = lower.match(new RegExp(`\\b${escapeRegExp(term)}\\b`, "g"))?.length ?? 0;
        if (matches === 0) continue;
        matchedTerms.push(term);
        const idf = Math.log((chunks.length + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;
        relevanceScore += matches * idf;
      }
      if (INDIAN_ENTITY_PATTERN.test(chunk.text)) relevanceScore += 1.75;
      if (/\b\d+(?:\.\d+)?%?\b/.test(chunk.text)) relevanceScore += 0.75;
      if (LEGAL_HOLDING_PATTERN.test(chunk.text)) relevanceScore += 1.25;
      if (BOILERPLATE_PATTERN.test(chunk.text)) relevanceScore -= 2.5;
      relevanceScore += Math.min(1, chunk.charLength / 600);
      return {
        ...chunk,
        relevanceScore: Number(Math.max(0, relevanceScore).toFixed(3)),
        keyTermsMatched: matchedTerms,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.index - b.index);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
