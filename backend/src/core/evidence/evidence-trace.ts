import type { EvidenceRegistryCore } from "./evidence-registry.js";
import type { CitationStrength, EvidenceSource, ExtractionQuality, TopChunk } from "./evidence-registry-types.js";

export interface EvidenceTrace {
  claimId: string;
  sourceId: number;
  chunkIndex?: number;
  chunkText?: string;
  url: string;
  citationStrength: CitationStrength;
  extractionQuality: ExtractionQuality;
}

export function buildEvidenceTrace(
  claimText: string,
  sourceId: number,
  registry: EvidenceRegistryCore,
): EvidenceTrace | null {
  const source = registry.getSource(sourceId);
  if (!source) return null;
  const matchingChunk = findBestChunk(claimText, source.topChunks);
  const fallbackText = matchingChunk ? undefined : findBestTextSpan(claimText, source);
  return {
    claimId: hashClaim(claimText),
    sourceId,
    chunkIndex: matchingChunk?.chunkIndex,
    chunkText: matchingChunk?.text ?? fallbackText,
    url: source.url,
    citationStrength: source.citationStrength,
    extractionQuality: source.extractionQuality,
  };
}

export function findBestChunk(claimText: string, chunks: TopChunk[]): TopChunk | undefined {
  const claimTokens = importantTokens(claimText);
  let best: { chunk: TopChunk; score: number } | undefined;
  for (const chunk of chunks) {
    const score = overlapScore(claimTokens, importantTokens(chunk.text)) + chunk.score / 100;
    if (score <= 0) continue;
    if (!best || score > best.score) best = { chunk, score };
  }
  return best?.chunk;
}

function findBestTextSpan(claimText: string, source: EvidenceSource): string | undefined {
  const claimTokens = importantTokens(claimText);
  const text = [source.fullText, source.snippet, ...source.keyFacts, ...source.legalHoldings].filter((value): value is string => Boolean(value?.trim())).join("\n\n");
  let best: { text: string; score: number } | undefined;
  for (const sentence of splitSentences(text)) {
    const score = overlapScore(claimTokens, importantTokens(sentence));
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && sentence.length < best.text.length)) best = { text: sentence, score };
  }
  return best?.text;
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8);
}

function importantTokens(text: string): Set<string> {
  return new Set(text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)));
}

function hashClaim(claim: string): string {
  let hash = 0;
  for (let index = 0; index < claim.length; index += 1) {
    hash = ((hash << 5) - hash + claim.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

const STOP_WORDS = new Set(["about", "also", "from", "india", "indian", "source", "that", "the", "this", "with"]);
