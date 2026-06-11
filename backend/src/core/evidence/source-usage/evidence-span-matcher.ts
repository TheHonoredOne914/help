import type { EvidenceSource } from "../evidence-registry.js";
import type { SourceUsageEvidenceSpan } from "./types.js";

const STOP_WORDS = new Set([
  "about",
  "also",
  "and",
  "are",
  "been",
  "being",
  "court",
  "from",
  "has",
  "have",
  "into",
  "its",
  "may",
  "not",
  "parliament",
  "relevant",
  "source",
  "such",
  "that",
  "the",
  "their",
  "this",
  "was",
  "were",
  "with",
]);

const BOILERPLATE_PATTERNS = [
  /\bcookie(s)?\b/i,
  /\bsubscribe\b/i,
  /\bsign\s*in\b/i,
  /\blog\s*in\b/i,
  /\badvertisement\b/i,
  /\bshare\s+(this|on)\b/i,
  /\ball rights reserved\b/i,
  /\bprivacy policy\b/i,
  /\bterms of use\b/i,
  /\bnewsletter\b/i,
  /\bnavigation\b/i,
  /\bskip to content\b/i,
];

export function findEvidenceSpanForText(claimText: string, source: EvidenceSource): SourceUsageEvidenceSpan | null {
  const normalizedClaim = cleanWhitespace(claimText);
  if (!normalizedClaim || isBoilerplateText(normalizedClaim)) return null;
  const claimTokens = importantTokens(normalizedClaim);
  if (!hasEnoughClaimSignal(claimTokens)) return null;

  let best: (SourceUsageEvidenceSpan & { score: number }) | undefined;
  for (const candidate of evidenceCandidates(source)) {
    const candidateTokens = importantTokens(candidate.text);
    const sharedTokens = sharedImportantTokens(claimTokens, candidateTokens);
    const phraseMatch = hasVerifiablePhrase(normalizedClaim, candidate.text, claimTokens);
    const score = sharedTokens.length + (phraseMatch ? 4 : 0) + (candidate.verifiedBy === "top_chunk" ? 1 : 0);
    if (!phraseMatch && sharedTokens.length < 3) continue;
    if (!best || score > best.score || (score === best.score && candidate.text.length < best.text.length)) {
      best = { ...candidate, sharedTokens, score };
    }
  }

  if (!best) return null;
  const { score: _score, ...span } = best;
  return span;
}

export function importantTokens(text: string): Set<string> {
  return new Set(cleanWhitespace(text)
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => (/^\d+$/.test(token) || token.length >= 4 || /^[A-Z]{2,8}$/.test(token)) && !STOP_WORDS.has(token.toLowerCase()))
    .map((token) => token.toLowerCase()));
}

export function sharedImportantTokens(left: Set<string>, right: Set<string>): string[] {
  const shared: string[] = [];
  for (const token of left) if (right.has(token)) shared.push(token);
  return shared;
}

export function isBoilerplateText(text: string): boolean {
  const normalized = cleanWhitespace(text);
  if (!normalized) return true;
  const hits = BOILERPLATE_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  if (hits >= 2) return true;
  if (hits >= 1 && importantTokens(normalized).size < 4) return true;
  return false;
}

export function normalizeText(text: string): string {
  return cleanWhitespace(text).toLowerCase();
}

export function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasEnoughClaimSignal(tokens: Set<string>): boolean {
  if (tokens.size >= 3) return true;
  const numeric = [...tokens].some((token) => /^\d+$/.test(token));
  return numeric && tokens.size >= 2;
}

function hasVerifiablePhrase(claimText: string, evidenceText: string, claimTokens: Set<string>): boolean {
  if (!hasEnoughClaimSignal(claimTokens)) return false;
  const evidence = normalizeText(evidenceText);
  const claim = normalizeText(claimText);
  if (claim.length >= 18 && evidence.includes(claim)) return true;
  if ([...claimTokens].some((token) => /^\d+$/.test(token)) && claim.length >= 6 && evidence.includes(claim)) return true;
  const words = [...claimTokens];
  for (let index = 0; index <= words.length - 3; index += 1) {
    if (evidence.includes(words.slice(index, index + 3).join(" "))) return true;
  }
  return false;
}

function evidenceCandidates(source: EvidenceSource): Array<Omit<SourceUsageEvidenceSpan, "sharedTokens">> {
  const quality = source.extractionQuality === "snippet"
    ? "snippet"
    : source.extractionQuality === "failed"
      ? "failed"
      : source.keyFacts.every((fact) => /^title-only relevance:/i.test(fact.trim()))
        ? "title_only"
        : source.extractionQuality;
  const candidates: Array<Omit<SourceUsageEvidenceSpan, "sharedTokens">> = [];
  for (const chunk of source.topChunks ?? []) {
    if (chunk.text?.trim()) {
      candidates.push({
        sourceId: source.id,
        text: cleanWhitespace(chunk.text),
        chunkIndex: chunk.chunkIndex,
        extractionQuality: quality,
        verifiedBy: "top_chunk",
      });
    }
  }
  const lists: Array<{ values: string[]; verifiedBy: SourceUsageEvidenceSpan["verifiedBy"] }> = [
    { values: source.keyFacts, verifiedBy: "key_fact" },
    { values: source.legalHoldings, verifiedBy: "legal_holding" },
    { values: source.keyNumbers, verifiedBy: "key_number" },
    { values: source.limitations, verifiedBy: "limitation" },
  ];
  for (const list of lists) {
    for (const value of list.values) {
      if (value?.trim()) {
        candidates.push({
          sourceId: source.id,
          text: cleanWhitespace(value),
          extractionQuality: quality,
          verifiedBy: list.verifiedBy,
        });
      }
    }
  }
  for (const candidate of [
    { text: source.fullText, verifiedBy: "full_text" as const },
    { text: source.snippet, verifiedBy: "snippet" as const },
  ]) {
    for (const sentence of splitSentences(candidate.text ?? "")) {
      candidates.push({
        sourceId: source.id,
        text: sentence.text,
        startOffset: sentence.startOffset,
        endOffset: sentence.endOffset,
        extractionQuality: quality,
        verifiedBy: candidate.verifiedBy,
      });
    }
  }
  return candidates.filter((candidate) => !isBoilerplateText(candidate.text));
}

function splitSentences(text: string): Array<{ text: string; startOffset: number; endOffset: number }> {
  return [...text.matchAll(/[^.!?\n]+[.!?]?/g)]
    .map((match) => ({
      text: cleanWhitespace(match[0]),
      startOffset: match.index ?? 0,
      endOffset: (match.index ?? 0) + match[0].length,
    }))
    .filter((item) => item.text.length >= 8);
}
