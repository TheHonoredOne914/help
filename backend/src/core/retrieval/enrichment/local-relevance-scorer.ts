import type { ScoredChunk, SourceChunk } from "./types.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "about", "india", "indian",
  "source", "official", "article", "court", "parliament",
]);

const INDIAN_ENTITY_PATTERN = /\b(Supreme Court|Parliament|Lok Sabha|Rajya Sabha|Vidhan Sabha|Article\s+\d+[A-Z]?|Ministry|Union|Election Commission|Treasury Bench|Opposition)\b/i;
const LEGAL_HOLDING_PATTERN = /\b(held|ruled|judgment|doctrine|constitutional|proportionality|rights?|federalism|public order|national security)\b/i;
const BOILERPLATE_PATTERN = /\b(cookie|subscribe|newsletter|advertisement|privacy policy|share this|sign in|login|navigation|footer)\b/i;

const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Chunks below this BM25 floor never enter packs. */
export const CHUNK_BM25_FLOOR = 0.35;

export function extractQueryTerms(query: string): Set<string> {
  const terms = new Set<string>();
  for (const match of query.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (match.length < 2) continue;
    if (STOPWORDS.has(match) && !/^\d+$/.test(match)) continue;
    terms.add(match);
  }
  return terms;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** BM25 (k1≈1.2, b≈0.75) over chunk tokens vs query terms, plus light domain boosts. */
export function scoreChunks(chunks: SourceChunk[], queryTerms: Set<string>): ScoredChunk[] {
  if (chunks.length === 0 || queryTerms.size === 0) {
    return chunks.map((chunk) => ({ ...chunk, relevanceScore: 0, keyTermsMatched: [] as string[] }));
  }

  const docs = chunks.map((chunk) => tokenize(chunk.text));
  const avgdl = docs.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    df.set(term, docs.filter((tokens) => tokens.includes(term)).length);
  }
  const N = chunks.length;

  return chunks
    .map((chunk, docIndex): ScoredChunk => {
      const tokens = docs[docIndex]!;
      const tfMap = new Map<string, number>();
      for (const token of tokens) tfMap.set(token, (tfMap.get(token) ?? 0) + 1);
      const matchedTerms: string[] = [];
      let bm25 = 0;
      for (const term of queryTerms) {
        const tf = tfMap.get(term) ?? 0;
        if (tf === 0) continue;
        matchedTerms.push(term);
        const n = df.get(term) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (tokens.length / Math.max(1, avgdl)));
        bm25 += idf * ((tf * (BM25_K1 + 1)) / denom);
      }
      let relevanceScore = bm25;
      if (INDIAN_ENTITY_PATTERN.test(chunk.text)) relevanceScore += 0.35;
      if (/\b\d+(?:\.\d+)?%?\b/.test(chunk.text)) relevanceScore += 0.2;
      if (LEGAL_HOLDING_PATTERN.test(chunk.text)) relevanceScore += 0.3;
      if (BOILERPLATE_PATTERN.test(chunk.text)) relevanceScore -= 1.5;
      return {
        ...chunk,
        relevanceScore: Number(Math.max(0, relevanceScore).toFixed(3)),
        keyTermsMatched: matchedTerms,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.index - b.index);
}

export function filterChunksByBm25Floor(chunks: ScoredChunk[], floor = CHUNK_BM25_FLOOR): ScoredChunk[] {
  return chunks.filter((chunk) => chunk.relevanceScore >= floor);
}
