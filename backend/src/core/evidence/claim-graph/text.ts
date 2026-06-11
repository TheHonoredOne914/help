const STOP_WORDS = new Set([
  "about",
  "against",
  "also",
  "and",
  "are",
  "been",
  "being",
  "from",
  "has",
  "have",
  "into",
  "its",
  "may",
  "not",
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

export function normalizeClaimText(text: string): string {
  return cleanWhitespace(text).toLowerCase().replace(/\bsource\s+\d+\b/g, "source");
}

export function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function importantClaimTokens(text: string): Set<string> {
  return new Set(normalizeClaimText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => (/^\d+$/.test(token) || token.length >= 3) && !STOP_WORDS.has(token)));
}

export function tokenOverlapScore(left: string, right: string): number {
  const leftTokens = importantClaimTokens(left);
  const rightTokens = importantClaimTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

export function hasClaimOverlap(left: string, right: string, threshold = 0.58): boolean {
  const normalizedLeft = normalizeClaimText(left);
  const normalizedRight = normalizeClaimText(right);
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.length >= 20 && normalizedRight.includes(normalizedLeft)) return true;
  if (normalizedRight.length >= 20 && normalizedLeft.includes(normalizedRight)) return true;
  return tokenOverlapScore(left, right) >= threshold;
}

export function extractNumbers(text: string): string[] {
  return [...new Set(text.match(/\b\d+(?:\.\d+)?\s?%|\b\d+(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\b/g) ?? [])]
    .map((value) => value.replace(/\s+/g, ""))
    .slice(0, 8);
}

export function extractRankValues(text: string): string[] {
  return [...text.matchAll(/\branked?\s+(\d{1,4})(?:st|nd|rd|th)?\b/gi)].map((match) => match[1]);
}

export function trendDirection(text: string): "increased" | "decreased" | null {
  if (/\b(increased?|rising|rose|higher|improved?|expanded|growth)\b/i.test(text)) return "increased";
  if (/\b(decreased?|declined?|fell|lower|reduced|worsened?|contracted)\b/i.test(text)) return "decreased";
  return null;
}

export function stableClaimId(prefix: string, text: string, sourceIds: number[]): string {
  let hash = 0;
  const value = `${text}:${sourceIds.join(",")}`;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}
