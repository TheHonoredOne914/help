import { createHash } from "node:crypto";
import { DIMENSION_KEYWORDS } from "./dimension-engine.js";
import type { DimensionName } from "./types.js";

export interface Passage {
  id: string;
  sourceIndex: number;
  sourceUrl: string;
  sourceTitle: string;
  sourceTier: string;
  text: string;
  wordCount: number;
  relevanceScore: number;
  evidenceDensityScore: number;
  dimensionTags: DimensionName[];
  containsNumber: boolean;
  containsCourtRef: boolean;
  containsArticleRef: boolean;
  containsDateRef: boolean;
}

export interface SemanticChunkOptions {
  sourceIndex?: number;
  sourceTitle?: string;
  sourceTier?: string;
  targetChunkWords?: number;
  overlapWords?: number;
}

const LEGAL_DOMAINS = /indiankanoon\.org|sci\.gov\.in|barandbench\.com|livelaw\.in/i;
const GOV_REPORT_DOMAINS = /cag\.gov\.in|ncrb\.gov\.in|pib\.gov\.in|prsindia\.org|sansad\.in/i;
const MEDIA_DOMAINS = /thehindu\.com|indianexpress\.com|livemint\.com|reuters\.com|bbc\.com/i;

export function semanticChunkDocument(
  text: string,
  sourceUrl: string,
  opts: SemanticChunkOptions = {},
): Passage[] {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return [];

  const targetChunkWords = opts.targetChunkWords ?? 180;
  const overlapWords = opts.overlapWords ?? 30;
  const chunks = chunkByDomain(cleaned, sourceUrl, targetChunkWords, overlapWords)
    .map((chunk) => chunk.trim())
    .filter((chunk) => wordCount(chunk) >= 25 || chunk === cleaned);

  return chunks.map((chunk) => buildPassage(chunk, sourceUrl, opts));
}

export function deduplicatePassagesSemantically(passages: Passage[]): Passage[] {
  const byHash = new Map<string, Passage>();
  for (const passage of passages) {
    const existing = byHash.get(passage.id);
    if (!existing || passage.evidenceDensityScore > existing.evidenceDensityScore) {
      byHash.set(passage.id, passage);
    }
  }

  const hashDeduped = [...byHash.values()].sort((a, b) =>
    (b.evidenceDensityScore + b.relevanceScore) - (a.evidenceDensityScore + a.relevanceScore)
  );
  const kept: Passage[] = [];
  const groups = hashDeduped.length <= 100
    ? new Map<string, Passage[]>([["all", hashDeduped]])
    : groupByLeadingBigram(hashDeduped);

  for (const group of groups.values()) {
    for (const candidate of group) {
      const duplicate = kept.find((existing) => jaccard(candidate.text, existing.text) >= 0.72);
      if (!duplicate) {
        kept.push(candidate);
      } else if (candidate.evidenceDensityScore > duplicate.evidenceDensityScore) {
        const idx = kept.indexOf(duplicate);
        kept[idx] = candidate;
      }
    }
  }

  return kept.sort((a, b) => a.sourceIndex - b.sourceIndex);
}

export function scoreEvidenceDensity(text: string): number {
  const numberScore = countMatches(text, /\b\d[\d,]*(?:\.\d+)?\s*(?:crore|lakh|million|billion|percent|%|cases|incidents)\b/gi) * 0.25;
  const courtScore = countMatches(text, /\b(Supreme Court|High Court|Tribunal|NCLAT|NCDRC|Article \d+|Section \d+|IPC|CrPC|UAPA|POCSO)\b/gi) * 0.30;
  const articleScore = countMatches(text, /\bArticle\s+\d+[A-Za-z]?\b/gi) * 0.20;
  const institutionScore = countMatches(text, /\b(CAG|NCRB|PIB|MEA|RBI|NITI|NHRC|ECI|CBI|ED|NIA|MoD|MHA)\b/gi) * 0.15;
  const dateScore = countMatches(text, /\b(20\d{2}|19\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi) * 0.10;
  return Math.min(1.0, numberScore + courtScore + articleScore + institutionScore + dateScore);
}

function buildPassage(text: string, sourceUrl: string, opts: SemanticChunkOptions): Passage {
  const normalizedPrefix = text.slice(0, 100).toLowerCase().replace(/\s+/g, " ");
  const containsNumber = /\b\d[\d,]*(?:\.\d+)?/.test(text);
  const containsCourtRef = /\b(Supreme Court|High Court|Tribunal|NCLAT|NCDRC|held|judg(?:e)?ment|writ|petitioner|respondent)\b/i.test(text);
  const containsArticleRef = /\bArticle\s+\d+[A-Za-z]?\b/i.test(text);
  const containsDateRef = /\b(20\d{2}|19\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(text);
  return {
    id: createHash("sha256").update(normalizedPrefix).digest("hex").slice(0, 16),
    sourceIndex: opts.sourceIndex ?? 0,
    sourceUrl,
    sourceTitle: opts.sourceTitle ?? "",
    sourceTier: opts.sourceTier ?? "untiered",
    text,
    wordCount: wordCount(text),
    relevanceScore: 0,
    evidenceDensityScore: scoreEvidenceDensity(text),
    dimensionTags: tagDimensions(text),
    containsNumber,
    containsCourtRef,
    containsArticleRef,
    containsDateRef,
  };
}

function chunkByDomain(text: string, sourceUrl: string, targetChunkWords: number, overlapWords: number): string[] {
  if (LEGAL_DOMAINS.test(sourceUrl)) return chunkLegal(text, targetChunkWords);
  if (GOV_REPORT_DOMAINS.test(sourceUrl)) return chunkGovernmentReport(text, targetChunkWords);
  if (MEDIA_DOMAINS.test(sourceUrl)) return text.split(/\n{2,}/).filter(Boolean);
  return slidingWindow(text, targetChunkWords, overlapWords);
}

function chunkLegal(text: string, targetChunkWords: number): string[] {
  const paras = text
    .replace(/\b(Accordingly|Therefore|In view of|For the foregoing reasons|In the result)\b/g, "\n\n$1")
    .split(/\n{2,}/)
    .filter(Boolean);
  const split = paras.flatMap((para) =>
    wordCount(para) > targetChunkWords * 2 ? splitSentencesIntoChunks(para, targetChunkWords) : [para]
  );
  return packParagraphs(split, targetChunkWords);
}

function chunkGovernmentReport(text: string, targetChunkWords: number): string[] {
  const sections = text
    .replace(/(^|\n)(#{1,3}\s+|\d+(?:\.\d+)*\s+|Section\s+\d+|Chapter\s+\d+)/gi, "\n\n$2")
    .split(/\n{2,}/)
    .filter(Boolean);
  const chunks: string[] = [];
  for (const section of sections) {
    if (wordCount(section) <= targetChunkWords * 2) {
      chunks.push(section);
    } else {
      chunks.push(...packParagraphs(section.split(/\n+/), targetChunkWords));
    }
  }
  return chunks;
}

function splitSentencesIntoChunks(text: string, targetChunkWords: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
  return packParagraphs(sentences, targetChunkWords);
}

function packParagraphs(parts: string[], targetChunkWords: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const next = current ? `${current}\n\n${part}` : part;
    if (wordCount(next) > targetChunkWords && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function slidingWindow(text: string, targetChunkWords: number, overlapWords: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= targetChunkWords) return [text];
  const chunks: string[] = [];
  const step = Math.max(1, targetChunkWords - overlapWords);
  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + targetChunkWords).join(" "));
    if (i + targetChunkWords >= words.length) break;
  }
  return chunks;
}

function tagDimensions(text: string): DimensionName[] {
  const lower = text.toLowerCase();
  const tags = new Set<DimensionName>();
  for (const [dimension, keywords] of Object.entries(DIMENSION_KEYWORDS) as [DimensionName, string[]][]) {
    if (keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) tags.add(dimension);
  }
  if (/\b(Supreme Court|High Court|Article\s+\d+|Section\s+\d+|POCSO|IPC|CrPC)\b/i.test(text)) {
    tags.add("constitutional");
    tags.add("judiciary");
  }
  if (/\b(UN|United Nations|treaty|convention|international)\b/i.test(text)) tags.add("diplomatic");
  return [...tags];
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((token) => token.length >= 4));
}

function jaccard(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection++;
  return intersection / (ta.size + tb.size - intersection);
}

function groupByLeadingBigram(passages: Passage[]): Map<string, Passage[]> {
  const groups = new Map<string, Passage[]>();
  for (const passage of passages) {
    const words = passage.text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
    const key = words.slice(0, 2).join(" ") || "misc";
    const group = groups.get(key) ?? [];
    group.push(passage);
    groups.set(key, group);
  }
  return groups;
}
