import type { CleanedText } from "./types.js";

const BOILERPLATE_PATTERNS = [
  /\bcookie(?:s)?(?: settings| policy| consent| preferences)?\b/gi,
  /\bsubscribe(?: now)?(?: to our newsletter)?\b/gi,
  /\bnewsletter\b/gi,
  /\badvertisement\b|\badvertising\b|\bsponsored\b/gi,
  /\bshare this(?: article| story)?\b/gi,
  /\bsign in\b|\blog ?in\b|\bregister now\b/gi,
  /\bprivacy policy\b|\bterms of use\b/gi,
  /\bskip to (?:main )?content\b|\bhome\s+news\s+opinion\b/gi,
  /\bmore from this section\b|\brelated articles\b/gi,
];

export function cleanExtractedText(raw: string): CleanedText {
  const normalized = normalizeControls(raw);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => normalizeParagraph(paragraph))
    .filter(Boolean);
  let removedChars = 0;
  const kept: string[] = [];

  for (const paragraph of paragraphs) {
    const beforeLength = paragraph.length;
    const cleaned = stripBoilerplatePhrases(paragraph);
    const wordCount = words(paragraph).length;
    const charRatio = beforeLength > 0 ? boilerplateMatchedChars(paragraph) / beforeLength : 0;
    const boilerplateLine = charRatio > 0.4 && wordCount <= 40;
    if (boilerplateLine) {
      removedChars += beforeLength;
      continue;
    }
    removedChars += Math.max(0, beforeLength - cleaned.length);
    if (cleaned) kept.push(cleaned);
  }

  const text = kept.join("\n\n").trim();
  const cleanedWords = words(text);
  const uniqueWords = new Set(cleanedWords.map((word) => word.toLowerCase()));
  const matchedChars = boilerplateMatchedChars(normalized);
  const boilerplateRatio = Math.min(1, Math.max(removedChars, matchedChars) / Math.max(1, normalized.length));

  return {
    text,
    boilerplateRatio,
    wordCount: cleanedWords.length,
    uniqueWordRatio: uniqueWords.size / Math.max(1, cleanedWords.length),
  };
}

function normalizeControls(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeParagraph(value: string): string {
  return value.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

function stripBoilerplatePhrases(value: string): string {
  let output = value;
  for (const pattern of BOILERPLATE_PATTERNS) output = output.replace(pattern, " ");
  return output.replace(/\s+/g, " ").trim();
}

function boilerplateHitCount(value: string): number {
  return BOILERPLATE_PATTERNS.reduce((count, pattern) => count + (value.match(pattern)?.length ?? 0), 0);
}

function boilerplateMatchedChars(value: string): number {
  let count = 0;
  for (const pattern of BOILERPLATE_PATTERNS) {
    for (const match of value.match(pattern) ?? []) count += match.length;
  }
  return count;
}

function words(value: string): string[] {
  return value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) ?? [];
}
