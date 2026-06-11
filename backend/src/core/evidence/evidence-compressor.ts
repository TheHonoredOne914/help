import type { ResearchMode } from "../config/research-mode.js";
import type { EvidenceSource, SourceClass } from "./evidence-registry.js";
import { selectFinalSources } from "./evidence-pack/final-source-selector.js";

export interface EvidenceCompressionBudget {
  mode?: ResearchMode;
  maxCards?: number;
  maxCardChars?: number;
  maxPackChars?: number;
  maxClaims?: number;
  maxSnippets?: number;
  sourceUsageIds?: number[];
  forceSourceIds?: number[];
  mustIncludeSourceIds?: number[];
}

export interface RankedParagraph {
  text: string;
  score: number;
}

export interface CompressedEvidenceCard {
  sourceId: number;
  title: string;
  url: string;
  canonicalUrl: string;
  bucketIds: string[];
  sourceClass: SourceClass;
  provider?: string;
  discoveredBy?: string[];
  extractionProvider?: string;
  extractionQuality: EvidenceSource["extractionQuality"];
  citationStrength: EvidenceSource["citationStrength"];
  topChunks: EvidenceSource["topChunks"];
  limitedSource: boolean;
  reliabilityScore: number;
  date: string | null;
  freshness: "fresh" | "semi_static" | "static" | "unknown";
  citationEligible: boolean;
  atomicClaims: string[];
  snippets: string[];
  keyNumbers: string[];
  legalHoldings: string[];
  namedEntities: string[];
  limitations: string[];
  relevanceReason: string;
  charLength: number;
}

export interface BudgetedEvidencePack {
  cards: CompressedEvidenceCard[];
  text: string;
  originalSources: number;
  includedSources: number;
  droppedSourceIds: number[];
  droppedReason: Record<number, string>;
  compressionApplied: boolean;
  charLength: number;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "and",
  "are",
  "because",
  "been",
  "being",
  "between",
  "from",
  "have",
  "india",
  "indian",
  "into",
  "issue",
  "more",
  "must",
  "only",
  "over",
  "that",
  "the",
  "their",
  "this",
  "through",
  "with",
]);

const STRONG_SOURCE_CLASSES = new Set<SourceClass>([
  "court_primary",
  "official_government",
  "parliamentary_records",
  "electoral_body",
]);

const CREDIBLE_CONTEXT_CLASSES = new Set<SourceClass>([
  "indian_major_media",
  "academic_journal",
  "legal_commentary",
  "policy_research",
  "democracy_index",
  "human_rights_watchdog",
  "digital_rights_watchdog",
  "press_freedom_index",
  "civic_space_monitor",
]);

export function compressSourceToEvidenceCard(
  source: EvidenceSource,
  query: string,
  budget: EvidenceCompressionBudget = {},
): CompressedEvidenceCard {
  const resolved = resolveBudget(budget);
  const queryTerms = extractQueryTerms(query);
  const atomicClaims = selectAtomicClaims(source, resolved.maxClaims);
  const sourceTopChunks = source.topChunks ?? [];
  const sourceText = sourceTopChunks.length ? sourceTopChunks.map((chunk) => chunk.text).join("\n\n") : source.fullText ?? source.snippet ?? "";
  const paragraphs = splitParagraphs(sourceText);
  const rankedParagraphs = rankParagraphsByRelevance(paragraphs, queryTerms);
  const snippets = dedupeNearDuplicateSnippets(
    rankedParagraphs
      .filter((paragraph) => paragraph.score > 0)
      .map((paragraph) => clipSentence(paragraph.text, 280)),
  ).slice(0, resolved.maxSnippets);
  const fallbackSnippets = snippets.length ? snippets : [sourceTopChunks[0]?.text, source.snippet, source.fullText].filter((value): value is string => Boolean(value?.trim())).map((value) => clipSentence(value, 240)).slice(0, 1);
  const relevanceReason = buildRelevanceReason(source, queryTerms, rankedParagraphs[0]);
  let card = buildCard(source, atomicClaims, fallbackSnippets, relevanceReason);

  while (card.charLength > resolved.maxCardChars && card.snippets.length > 1) {
    card = buildCard(source, card.atomicClaims, card.snippets.slice(0, -1), relevanceReason);
  }
  while (card.charLength > resolved.maxCardChars && card.atomicClaims.length > 1) {
    card = buildCard(source, card.atomicClaims.slice(0, -1), card.snippets, relevanceReason);
  }
  if (card.charLength > resolved.maxCardChars) {
    card = buildCard(
      source,
      card.atomicClaims.slice(0, 2).map((claim) => clipSentence(claim, Math.max(60, Math.floor(resolved.maxCardChars / 8)))),
      card.snippets.slice(0, 1).map((snippet) => clipSentence(snippet, Math.max(80, Math.floor(resolved.maxCardChars / 7)))),
      clipSentence(relevanceReason, 110),
    );
  }
  if (card.charLength > resolved.maxCardChars) {
    card = buildCard(
      source,
      card.atomicClaims.slice(0, 1).map((claim) => clipSentence(claim, 70)),
      [],
      clipSentence(relevanceReason, 80),
    );
  }
  return card;
}

export function rankParagraphsByRelevance(paragraphs: string[], queryTerms: Set<string>): RankedParagraph[] {
  return paragraphs
    .map((text) => {
      const normalized = normalizeText(text);
      const words = new Set(tokenize(normalized));
      let score = 0;
      for (const term of queryTerms) {
        if (words.has(term)) score += 4;
        else if ([...words].some((word) => word.startsWith(term) || term.startsWith(word))) score += 2;
      }
      if (/\b(supreme court|election commission|union government|ministry|article|constitutional|parliament|lok sabha|rajya sabha|aippm)\b/i.test(text)) score += 3;
      if (/\b(held|judgment|report|data|official|committee|question|proportionality|rights|federalism)\b/i.test(text)) score += 2;
      if (/\b(cookie|subscribe|navigation|advertisement|sitemap|contact us)\b/i.test(text)) score -= 4;
      return { text: cleanWhitespace(text), score };
    })
    .filter((item) => item.text.length >= 30)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length);
}

export function dedupeNearDuplicateSnippets(snippets: string[]): string[] {
  const out: string[] = [];
  for (const snippet of snippets.map(cleanWhitespace).filter(Boolean)) {
    const normalized = normalizeText(snippet);
    if (out.some((existing) => jaccard(tokenize(normalizeText(existing)), tokenize(normalized)) >= 0.72)) continue;
    out.push(snippet);
  }
  return out;
}

export function buildBudgetedEvidencePack(
  sources: EvidenceSource[],
  query: string,
  budget: EvidenceCompressionBudget = {},
): BudgetedEvidencePack {
  const resolved = resolveBudget(budget);
  const sourceUsageIds = new Set(budget.sourceUsageIds ?? []);
  const forceSourceIds = new Set(budget.forceSourceIds ?? []);
  const mustIncludeSourceIds = new Set([...(budget.mustIncludeSourceIds ?? []), ...(budget.forceSourceIds ?? [])]);
  const effectiveBudget = { ...resolved, maxCards: Math.max(resolved.maxCards, mustIncludeSourceIds.size) };
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const orderedSources = selectFinalSources(sources, {
    query,
    limit: sources.length,
    mode: effectiveBudget.mode,
    sourceUsageIds: [...sourceUsageIds],
    forceSourceIds: [...forceSourceIds],
    mustIncludeSourceIds: [...mustIncludeSourceIds],
  });
  const scored = orderedSources
    .map((source) => ({ source, score: scoreSource(source, sourceUsageIds, new Set([...forceSourceIds, ...mustIncludeSourceIds])) }));
  const selected: CompressedEvidenceCard[] = [];
  const selectedBuckets = new Set<string>();
  const droppedReason: Record<number, string> = {};

  for (const item of scored) {
    const mustInclude = mustIncludeSourceIds.has(item.source.id);
    if (selected.length >= effectiveBudget.maxCards && !mustInclude) {
      droppedReason[item.source.id] = "card_limit";
      continue;
    }
    const diversityBonus = item.source.bucketIds.some((bucketId) => !selectedBuckets.has(bucketId));
    const card = compressSourceToEvidenceCard(item.source, query, {
      ...effectiveBudget,
      maxCardChars: Math.min(effectiveBudget.maxCardChars, Math.max(220, Math.floor(effectiveBudget.maxPackChars / Math.max(1, effectiveBudget.maxCards)) - 80)),
    });
    if (!hasUsableCompressedEvidence(card)) {
      if (mustInclude) throw new Error("PROMPT_BUDGET_CANNOT_FIT_MUST_INCLUDE_SOURCES");
      droppedReason[item.source.id] = "no_usable_evidence";
      continue;
    }
    const candidateText = renderPack([...selected, card]);
    if (candidateText.length > effectiveBudget.maxPackChars) {
      if (tryCompactFit(selected, sourceById, item.source, query, effectiveBudget)) {
        for (const bucketId of item.source.bucketIds) selectedBuckets.add(bucketId);
        continue;
      }
      if (mustInclude) throw new Error("PROMPT_BUDGET_CANNOT_FIT_MUST_INCLUDE_SOURCES");
      droppedReason[item.source.id] = "pack_char_budget";
      continue;
    }
    selected.push(card);
    for (const bucketId of card.bucketIds) selectedBuckets.add(bucketId);
    if (!diversityBonus && selected.length >= effectiveBudget.maxCards) break;
  }

  if (selected.length < effectiveBudget.maxCards) {
    for (const item of scored) {
      if (selected.some((card) => card.sourceId === item.source.id)) continue;
      const mustInclude = mustIncludeSourceIds.has(item.source.id);
      if (selected.length >= effectiveBudget.maxCards && !mustInclude) {
        droppedReason[item.source.id] = droppedReason[item.source.id] ?? "card_limit";
        continue;
      }
      const card = compressSourceToEvidenceCard(item.source, query, {
        ...effectiveBudget,
        maxCardChars: Math.min(effectiveBudget.maxCardChars, Math.max(220, Math.floor(effectiveBudget.maxPackChars / Math.max(1, effectiveBudget.maxCards)) - 80)),
      });
      if (!hasUsableCompressedEvidence(card)) {
        if (mustInclude) throw new Error("PROMPT_BUDGET_CANNOT_FIT_MUST_INCLUDE_SOURCES");
        droppedReason[item.source.id] = droppedReason[item.source.id] ?? "no_usable_evidence";
        continue;
      }
      const candidateText = renderPack([...selected, card]);
      if (candidateText.length > effectiveBudget.maxPackChars) {
        if (tryCompactFit(selected, sourceById, item.source, query, effectiveBudget)) continue;
        if (mustInclude) throw new Error("PROMPT_BUDGET_CANNOT_FIT_MUST_INCLUDE_SOURCES");
        droppedReason[item.source.id] = droppedReason[item.source.id] ?? "pack_char_budget";
        continue;
      }
      selected.push(card);
    }
  }

  const selectedIds = new Set(selected.map((card) => card.sourceId));
  for (const source of sources) {
    if (!selectedIds.has(source.id)) {
      droppedReason[source.id] = droppedReason[source.id] ?? (source.citationEligible ? "lower_ranked_evidence" : "not_citation_eligible");
    }
  }

  const text = renderPack(selected);
  return {
    cards: selected,
    text,
    originalSources: sources.length,
    includedSources: selected.length,
    droppedSourceIds: sources.map((source) => source.id).filter((sourceId) => !selected.some((card) => card.sourceId === sourceId)),
    droppedReason,
    compressionApplied: selected.length < sources.length || text.length < sources.reduce((sum, source) => sum + (source.fullText?.length ?? source.snippet?.length ?? 0), 0),
    charLength: text.length,
  };
}

function tryCompactFit(
  selected: CompressedEvidenceCard[],
  sourceById: Map<number, EvidenceSource>,
  candidate: EvidenceSource,
  query: string,
  budget: Required<Omit<EvidenceCompressionBudget, "sourceUsageIds" | "forceSourceIds" | "mustIncludeSourceIds">>,
): boolean {
  if (selected.length === 0) return false;
  const compactCards = [
    ...selected.map((card) => sourceById.get(card.sourceId)).filter((source): source is EvidenceSource => Boolean(source)),
    candidate,
  ].map((source) => compressSourceToEvidenceCard(source, query, {
    ...budget,
    maxCardChars: Math.max(220, Math.floor(budget.maxPackChars / Math.max(1, budget.maxCards)) - 180),
    maxClaims: 1,
    maxSnippets: 0,
  }));
  if (compactCards.some((card) => !hasUsableCompressedEvidence(card))) return false;
  const text = renderPack(compactCards);
  if (text.length > budget.maxPackChars) return false;
  selected.splice(0, selected.length, ...compactCards);
  return true;
}

export function renderCompressedEvidenceCard(card: CompressedEvidenceCard): string {
  const canonical = card.canonicalUrl === card.url ? "same" : card.canonicalUrl;
  return [
    `[Source ${card.sourceId}] ${card.title}`,
    `URL=${card.url}; canon=${canonical}`,
    `Meta=${card.sourceClass}; buckets=${card.bucketIds.join(",") || "none"}; prov=${card.provider ?? card.discoveredBy?.join(",") ?? "unknown"}; ext=${card.extractionProvider ?? "unknown"}; q=${card.extractionQuality}; strength=${card.citationStrength}; limited=${card.limitedSource}; score=${card.reliabilityScore}; date=${card.date ?? "unknown"}; fresh=${card.freshness}; eligible=${card.citationEligible}`,
    `Facts=${card.atomicClaims.join(" | ") || "none"}`,
    `Numbers=${card.keyNumbers.join(" | ") || "none"}; Legal=${card.legalHoldings.join(" | ") || "none"}`,
    `Entities=${card.namedEntities.join(" | ") || "none"}`,
    `Snippets=${card.snippets.join(" | ") || "none"}`,
    `Limitations=${card.limitations.join(" | ") || "none"}`,
    `Why=${card.relevanceReason}`,
  ].join("\n");
}

function resolveBudget(budget: EvidenceCompressionBudget): Required<Omit<EvidenceCompressionBudget, "sourceUsageIds" | "forceSourceIds" | "mustIncludeSourceIds">> {
  const mode = budget.mode ?? "deep_research";
  const defaults = mode === "fast_research"
    ? { maxCards: 10, maxCardChars: 850, maxPackChars: 9_000, maxClaims: 3, maxSnippets: 1 }
    : mode === "deep_research"
      ? { maxCards: 22, maxCardChars: 1_050, maxPackChars: 22_000, maxClaims: 4, maxSnippets: 2 }
      : { maxCards: 40, maxCardChars: 1_250, maxPackChars: 42_000, maxClaims: 5, maxSnippets: 2 };
  return {
    mode,
    maxCards: budget.maxCards ?? defaults.maxCards,
    maxCardChars: budget.maxCardChars ?? defaults.maxCardChars,
    maxPackChars: budget.maxPackChars ?? defaults.maxPackChars,
    maxClaims: budget.maxClaims ?? defaults.maxClaims,
    maxSnippets: budget.maxSnippets ?? defaults.maxSnippets,
  };
}

function buildCard(source: EvidenceSource, atomicClaims: string[], snippets: string[], relevanceReason: string): CompressedEvidenceCard {
  const card: Omit<CompressedEvidenceCard, "charLength"> = {
    sourceId: source.id,
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    provider: source.discoveredBy?.[0],
    discoveredBy: source.discoveredBy,
    extractionProvider: source.extractedBy,
    extractionQuality: source.extractionQuality,
    citationStrength: source.citationStrength ?? "weak",
    topChunks: source.topChunks ?? [],
    limitedSource: Boolean(source.limitedSource),
    reliabilityScore: source.authorityScore,
    date: source.date,
    freshness: freshnessForDate(source.date),
    citationEligible: source.citationEligible,
    atomicClaims,
    snippets,
    keyNumbers: source.keyNumbers.slice(0, 5),
    legalHoldings: source.legalHoldings.slice(0, 2),
    namedEntities: source.namedEntities.slice(0, 8),
    limitations: source.limitations.slice(0, 3),
    relevanceReason,
  };
  return { ...card, charLength: renderCompressedEvidenceCard({ ...card, charLength: 0 }).length };
}

function freshnessForDate(date: string | null): CompressedEvidenceCard["freshness"] {
  if (!date) return "unknown";
  const year = Number(date.match(/\b(20\d{2})\b/)?.[1]);
  if (!year) return "unknown";
  const currentYear = new Date().getFullYear();
  if (year >= currentYear - 1) return "fresh";
  if (year >= currentYear - 4) return "semi_static";
  return "static";
}

function selectAtomicClaims(source: EvidenceSource, maxClaims: number): string[] {
  return dedupeNearDuplicateSnippets([
    ...source.legalHoldings,
    ...source.keyFacts,
    ...source.keyNumbers.map((number) => `Numeric evidence: ${number}`),
    ...source.topChunks.map((chunk) => chunk.text),
  ]
    .map((claim) => clipSentence(claim, 220))
    .filter((claim) => claim.length >= 12 && !/^title-only relevance:/i.test(claim)))
    .slice(0, Math.max(1, maxClaims));
}

function hasUsableCompressedEvidence(card: CompressedEvidenceCard): boolean {
  return [
    ...card.atomicClaims,
    ...card.snippets,
    ...card.keyNumbers,
    ...card.legalHoldings,
  ].some((value) => {
    const text = value.trim();
    return text.length >= 8
      && !/^limitation:/i.test(text)
      && !/^title-only relevance:/i.test(text);
  });
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
    .map(cleanWhitespace)
    .filter((part) => part.length >= 30 && part.length <= 1200);
}

function buildRelevanceReason(source: EvidenceSource, queryTerms: Set<string>, topParagraph?: RankedParagraph): string {
  const bucket = source.bucketIds[0] ?? "unbucketed";
  const classReason = STRONG_SOURCE_CLASSES.has(source.sourceClass)
    ? `${source.sourceClass} source has primary authority`
    : CREDIBLE_CONTEXT_CLASSES.has(source.sourceClass)
      ? `${source.sourceClass} source provides corroborating context`
      : `${source.sourceClass} source is lower priority`;
  const matchedTerms = [...queryTerms].filter((term) => normalizeText(`${source.title} ${topParagraph?.text ?? ""}`).includes(term)).slice(0, 5);
  return `${classReason}; bucket=${bucket}; matched=${matchedTerms.join(", ") || "topic context"}.`;
}

function scoreSource(source: EvidenceSource, sourceUsageIds: Set<number>, forceSourceIds: Set<number>): number {
  let score = source.authorityScore;
  if (forceSourceIds.has(source.id)) score += 1_000;
  if (sourceUsageIds.has(source.id)) score += 120;
  if (source.citationEligible) score += 80;
  if (STRONG_SOURCE_CLASSES.has(source.sourceClass)) score += 45;
  else if (CREDIBLE_CONTEXT_CLASSES.has(source.sourceClass)) score += 20;
  if (source.sourceClass === "social_media" || source.sourceClass === "low_quality") score -= 80;
  if (source.date && /202[4-9]|203\d/.test(source.date)) score += 8;
  score += Math.min(12, source.bucketIds.length * 3);
  return score;
}

function renderPack(cards: CompressedEvidenceCard[]): string {
  return cards.map(renderCompressedEvidenceCard).join("\n\n");
}

function extractQueryTerms(query: string): Set<string> {
  return new Set(tokenize(normalizeText(query)).filter((term) => term.length >= 4 && !STOP_WORDS.has(term)));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/s$/, ""))
    .filter(Boolean);
}

function normalizeText(text: string): string {
  return cleanWhitespace(text).toLowerCase();
}

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipSentence(text: string, maxChars: number): string {
  const cleaned = cleanWhitespace(text);
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}.`;
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a.filter((word) => word.length > 3 && !STOP_WORDS.has(word)));
  const right = new Set(b.filter((word) => word.length > 3 && !STOP_WORDS.has(word)));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const word of left) {
    if (right.has(word)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}
