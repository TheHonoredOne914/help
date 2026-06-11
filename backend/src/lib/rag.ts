import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { LRUCache } from "lru-cache";
import type { CommitteeType, DimensionEngineOutput, DimensionName, DimensionScore, EnrichedResult, SearchResult } from "./types.js";
import { extractCourtJudgement, sourceBadge } from "./web-search.js";
import { logger } from "./logger.js";
import { telemetry } from "./telemetry.js";
import { deduplicatePassagesSemantically, semanticChunkDocument, type Passage } from "./passage-engine.js";
import { extractWithFallback } from "../core/search/search-provider-router.js";

const FETCH_UA =
  "BestDel-Crawler/1.0 (Research Assistant for Indian MUN; contact@bestdel.app)";

const pageCache = new LRUCache<string, string>({ max: 500, ttl: 1000 * 60 * 10 });

export interface RankedPassage {
  sourceIndex: number;
  sourceUrl: string;
  sourceTitle: string;
  text: string;
  relevanceScore: number;
}

const passageCache = new LRUCache<string, RankedPassage[]>({
  max: 100,
  ttl: 1000 * 60 * 10,
});
const conflictCache = new LRUCache<string, string[]>({ max: 200, ttl: 1000 * 60 * 5 });

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "ref_src"].forEach((k) =>
      u.searchParams.delete(k)
    );
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function extractIndianKanoonContent(html: string, url: string): string {
  const { document } = parseHTML(html);
  const judgmentDiv = document.querySelector("#doc");
  if (judgmentDiv) {
    for (const el of judgmentDiv.querySelectorAll(".rc-nav, .catlinks, #djudnotes")) {
      el.remove();
    }
    const text = judgmentDiv.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length > 200) return text.slice(0, 15000);
  }

  const article = new Readability(document as any).parse();
  return (article?.textContent ?? "").trim().slice(0, Math.min(12000, url.length + 12000));
}

// â”€â”€â”€ PHASE 5: Concurrency-limited parallel execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let idx = 0;

  async function runNext(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        const value = await tasks[i]();
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

// â”€â”€â”€ PHASE 4: Adaptive page fetch timeouts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function fetchPageContent(url: string, maxChars = 12000, jinaKey?: string | null, firecrawlKey?: string | null, snippet?: string | null): Promise<string> {
  const cached = pageCache.get(url);
  if (cached !== undefined) return cached;

  // Skip URLs that are unlikely to have useful HTML content
  if (/\.(pdf|docx|xlsx|pptx|zip|gz|mp4|mp3|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/i.test(url)) {
    pageCache.set(url, "");
    return "";
  }

  if (firecrawlKey?.trim() || jinaKey?.trim()) {
    try {
      const extracted = await extractWithFallback(url, {
        keys: { firecrawl: firecrawlKey, jina: jinaKey },
        timeoutMs: 15000,
        snippet,
      });
      const extractedText = extracted.markdown ?? extracted.text ?? extracted.excerpt ?? "";
      if (extractedText) {
        const text = extractedText.slice(0, maxChars);
        pageCache.set(url, text);
        return text;
      }
    } catch {
      // fall through to Readability
    }
  }

  // High-value sources get more time â€” they're worth waiting for under high ping
  const isHighValueSource = /\b(un\.org|mea\.gov\.in|pib\.gov\.in|who\.int|worldbank\.org|reuters\.com|thehindu\.com|icj-cij\.org)\b/i.test(url);
  const TIMEOUT_MS = isHighValueSource ? 18000 : 12000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) {
      const isAntiScrape = res.status === 403 || res.status === 429;
      if (isAntiScrape) {
        logger.debug({ url, status: res.status }, "[fetch] anti-scrape block detected");
        telemetry.increment("fetch.blocked");
        return "";
      }
      pageCache.set(url, "");
      return "";
    }

    const html = await res.text();
    if (url.toLowerCase().includes("indiankanoon.org")) {
      const out = extractIndianKanoonContent(html, url).slice(0, maxChars);
      pageCache.set(url, out);
      return out;
    }
    const { document } = parseHTML(html);

    // Try Readability first
    const article = new Readability(document as any).parse();
    let text = (article?.textContent ?? "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\t+/g, " ")
      .trim();

    // Fallback: collect paragraph/heading/list text
    if (text.length < 200) {
      const paras = Array.from(document.querySelectorAll("p, h1, h2, h3, li"))
        .map((el: any) => el.textContent?.trim() ?? "")
        .filter((t: string) => t.length > 30)
        .join("\n");
      if (paras.length > text.length) text = paras;
    }

    const out = text.slice(0, maxChars);
    pageCache.set(url, out);
    return out;
  } catch {
    pageCache.set(url, "");
    return "";
  }
}

function getAdaptiveContentLimit(url: string): number {
  const u = url.toLowerCase();
  if (u.includes("indiankanoon.org")) return 25000;
  if (u.includes("cag.gov.in")) return 20000;
  if (u.includes("ncrb.gov.in")) return 18000;
  if (u.includes("prsindia.org")) return 15000;
  if (u.includes("mea.gov.in")) return 10000;
  if (u.includes("pib.gov.in")) return 8000;
  if (u.includes("un.org")) return 15000;
  if (u.includes("worldbank.org")) return 15000;
  if (u.includes("hrw.org")
   || u.includes("amnesty")
   || u.includes("freedomhouse.org")) return 15000;
  return 12000;
}

// â”€â”€â”€ Source quality tiering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SOURCE_TIERS: [RegExp, number][] = [
  [/\b(un\.org|undp\.org|unicef\.org|unhcr\.org|who\.int|iaea\.org|wto\.org)\b/i, 1.0],
  [/\b(mea\.gov\.in|pib\.gov\.in|pmoindia\.gov\.in|meaindia\.in)\b/i, 1.0],
  [/\b(icj-cij\.org|icc-cpi\.int|opcw\.org|ctbto\.org)\b/i, 1.0],
  [/\b(worldbank\.org|imf\.org|weforum\.org|oecd\.org)\b/i, 0.85],
  [/\b(thehindu\.com|indianexpress\.com|livemint\.com|business-standard\.com|ndtv\.com|scroll\.in|thewire\.in)\b/i, 0.7],
  [/\b(reuters\.com|apnews\.com|bbc\.(com|co\.uk)|aljazeera\.com|foreignpolicy\.com|cfr\.org)\b/i, 0.7],
  [/\b(jstor\.org|scholar\.google|researchgate\.net|ssrn\.com|brookings\.edu|chathamhouse\.org|sipri\.org)\b/i, 0.8],
  [/\bwikipedia\.org\b/i, 0.3],
  [/\b(quora\.com|reddit\.com|pinterest\.com|instagram\.com|tiktok\.com|youtube\.com)\b/i, -0.3],
  [/\b(buzzfeed|clickbait|toplist|listicle)\b/i, -0.3],
];

export function getSourceTierBonus(url: string): number {
  for (const [pattern, bonus] of SOURCE_TIERS) {
    if (pattern.test(url)) return bonus;
  }
  return 0;
}

export function scoreRelevance(query: string, title: string, content: string, url = ""): number {
  const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTokens.length === 0) return 0.1;
  const text = (title + " " + content).toLowerCase();
  const termFrequency = queryTokens.filter((t) => text.includes(t)).length / queryTokens.length;
  const freshness = freshnessScore(content, new Date().getFullYear());
  const lengthBonus = Math.min(content.length / 4000, 1) * 0.15;
  const titleBonus = (queryTokens.filter((t) => title.toLowerCase().includes(t)).length / queryTokens.length) * 0.2;
  const tierBonus = getSourceTierBonus(url);
  const isMunQuery = /\b(UN|UNSC|UNGA|HRC|resolution|committee|delegate|bloc|India|MEA|treaty|sanction)\b/i.test(query);
  const munBonus = isMunQuery && tierBonus >= 0.7 ? 0.15 : 0;
  return Math.min(1.5, termFrequency + freshness + lengthBonus + titleBonus + tierBonus + munBonus);
}

function freshnessScore(content: string, currentYear: number): number {
  for (let offset = 0; offset <= 3; offset++) {
    const year = currentYear - offset;
    if (new RegExp(`\\b${year}\\b`).test(content)) {
      return Math.max(0, 0.30 - offset * 0.08);
    }
  }
  return 0;
}

function chunkText(text: string, chunkSize = 300): string[] {
  const isLegalDoc = /\b(held|petitioner|respondent|writ|article|section|judgment|judgement|appellant)\b/i
    .test(text.slice(0, 500));
  const targetChunkSize = isLegalDoc ? 250 : Math.min(chunkSize, 220);
  const paragraphs = isLegalDoc
    ? text
        .replace(/\b(Accordingly|Therefore|In view of|For the foregoing reasons|In the result)\b/g, "\n\n$1")
        .split(/\n{2,}/)
    : text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).split(/\s+/).length > targetChunkSize && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.split(/\s+/).length > 20);
}

export async function rerankPassages(
  results: EnrichedResult[],
  query: string,
  jinaKey: string,
  topN = 8,
  mode: "web" | "deep" = "web",
): Promise<RankedPassage[]> {
  const urlList = results.map(r => canonicalizeUrl(r.url)).join("|");
  const urlHash = urlList.split("").reduce((h, c) =>
    (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0
  ).toString(36);
  const cacheKey = `rerank::${jinaKey ? "jina" : "local"}::${urlHash}::${query.slice(0, 80)}`;
  const cached = passageCache.get(cacheKey);
  if (cached) return cached;

  const passages: Passage[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const text = r.content || r.snippet || "";
    passages.push(
      ...semanticChunkDocument(text, r.url, {
        sourceIndex: i,
        sourceTitle: r.title,
        sourceTier: r.sourceType ?? "general",
      })
    );
  }

  if (passages.length === 0) return [];
  telemetry.histogram("passage.pre_dedup_count", passages.length);
  const dedupedPassages = deduplicatePassagesSemantically(passages);
  const evidenceDense = dedupedPassages
    .filter((passage) => passage.evidenceDensityScore >= 0.08)
    .sort((a, b) => b.evidenceDensityScore - a.evidenceDensityScore)
    .slice(0, 50);
  telemetry.histogram("passage.post_filter_count", evidenceDense.length);
  if (evidenceDense.length === 0) return [];

  try {
    if (!jinaKey) throw new Error("Jina key unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), mode === "deep" ? 30_000 : 12_000);
    const passagesToRank = evidenceDense;
    const resp = await fetch("https://api.jina.ai/v1/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jinaKey}`,
      },
      body: JSON.stringify({
        model: "jina-reranker-v2-base-multilingual",
        query,
        documents: passagesToRank.map(p => p.text),
        top_n: topN,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`Jina rerank ${resp.status}`);
    telemetry.increment("reranker.jina_used");

    const data = await resp.json() as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    const ranked = data.results
      .map(r => ({
        ...passagesToRank[r.index],
        relevanceScore: r.relevance_score,
      }))
      .filter((passage) => passage.relevanceScore >= 0.25)
      .slice(0, topN);
    passageCache.set(cacheKey, ranked);
    return ranked;
  } catch (err) {
    logger.warn({ err, query, passageCount: evidenceDense.length }, "[reranker] Jina fallback to local scoring");
    telemetry.increment("reranker.local_fallback");
    const ranked = evidenceDense
      .map(p => ({
        ...p,
        relevanceScore: scoreRelevance(query, p.sourceTitle, p.text, p.sourceUrl)
          + getSourceTierBonus(p.sourceUrl) * 0.3,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .filter((passage) => passage.relevanceScore >= 0.25)
      .slice(0, topN);
    passageCache.set(cacheKey, ranked);
    return ranked;
  }
}

// â”€â”€â”€ PHASE 5: enrichResults with concurrency cap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function enrichResults(
  results: SearchResult[],
  query: string,
  topN = 6,
  onPage?: (idx: number, total: number, url: string) => void,
  jinaKey?: string | null,
  mode: "web" | "deep" = "web",
  minFullContent = 0,
  firecrawlKey?: string | null,
): Promise<EnrichedResult[]> {
  const effectiveTopN = Math.max(minFullContent, mode === "deep" ? Math.min(20, topN * 2) : topN);
  const seen = new Set<string>();
  const dedup: SearchResult[] = [];
  for (const r of results) {
    const can = canonicalizeUrl(r.url);
    if (seen.has(can)) continue;
    seen.add(can);
    dedup.push({ ...r, url: can });
  }

  const sorted = [...dedup].sort((a, b) => {
    const aScore = typeof a.score === "number" && a.score > 1
      ? (a.score / 10) + getSourceTierBonus(a.url) * 0.3
      : getSourceTierBonus(a.url);
    const bScore = typeof b.score === "number" && b.score > 1
      ? (b.score / 10) + getSourceTierBonus(b.url) * 0.3
      : getSourceTierBonus(b.url);
    return bScore - aScore;
  });
  const targets = sorted.slice(0, effectiveTopN);
  const tail = sorted.slice(effectiveTopN);

  const settled = await fetchWithConcurrencyLimit(
    targets.map((r, i) => async () => {
      let content: string;

      if (r.hasRawContent && r.snippet && r.snippet.length > 500) {
        content = r.snippet;
      } else {
        const maxChars = getAdaptiveContentLimit(r.url);
        content = await fetchPageContent(r.url, maxChars, jinaKey, firecrawlKey, r.snippet);
      }

      onPage?.(i, targets.length, r.url);
      const relevanceScore = scoreRelevance(query, r.title, content || r.snippet, r.url);
      const authorityScore = typeof r.score === "number" && r.score > 1 ? r.score : 5;
      const enrichedResult: EnrichedResult = {
        ...r,
        content,
        score: authorityScore,
        relevanceScore,
        combinedScore: authorityScore * 0.6 + relevanceScore * 10 * 0.4,
      };
      if (r.sourceType === "court_judgement" && content.length > 200) {
        const judgement = extractCourtJudgement(content, r.url);
        if (judgement.isJudgement) enrichedResult.judgement = judgement;
      }
      return enrichedResult;
    }),
    6
  );

  const enriched: EnrichedResult[] = settled
    .filter((s): s is PromiseFulfilledResult<EnrichedResult> => s.status === "fulfilled")
    .map((s) => s.value);

  const tailEnriched: EnrichedResult[] = tail.map((r) => {
    const relevanceScore = scoreRelevance(query, r.title, r.snippet, r.url);
    const authorityScore = typeof r.score === "number" && r.score > 1 ? r.score : 5;
    return {
      ...r,
      content: "",
      score: authorityScore,
      relevanceScore,
      combinedScore: authorityScore * 0.6 + relevanceScore * 10 * 0.4,
    };
  });

  return [...enriched, ...tailEnriched].sort((a, b) =>
    (b.combinedScore ?? b.score) - (a.combinedScore ?? a.score)
  );
}

// â”€â”€â”€ Source conflict detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function detectSourceConflicts(results: EnrichedResult[]): string[] {
  const key = results.slice(0, 5).map((result) => canonicalizeUrl(result.url)).join("|");
  const cached = conflictCache.get(key);
  if (cached) return cached;
  const conflicts: string[] = [];
  const numericPattern = /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(billion|million|thousand|%|percent|countries|members|votes)\b/gi;
  const topResults = results.slice(0, 10).filter((r) => r.content.length > 200);
  for (let i = 0; i < topResults.length; i++) {
    for (let j = i + 1; j < topResults.length; j++) {
      const aNumbers = [...topResults[i].content.matchAll(numericPattern)].map((m) => m[0].toLowerCase());
      const bNumbers = [...topResults[j].content.matchAll(numericPattern)].map((m) => m[0].toLowerCase());
      for (const aNum of aNumbers) {
        const unit = aNum.split(/\s+/).pop() ?? "";
        const bConflict = bNumbers.find((b) => b.endsWith(unit) && b !== aNum);
        if (bConflict) {
          conflicts.push(
            `âš ï¸ Conflict detected: Source ${i + 1} states "${aNum}" while Source ${j + 1} says "${bConflict}" â€” verify independently.`
          );
        }
      }
    }
  }
  const uniqueConflicts = [...new Set(conflicts)].slice(0, 6);
  conflictCache.set(key, uniqueConflicts);
  return uniqueConflicts;
}

// â”€â”€â”€ Structured insight extraction (regex-based, no LLM quota burn) â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface StructuredInsights {
  stats: string[];        // numeric claims: "145 million people", "38%"
  bullets: string[];      // short factual sentences extracted from the page
  keyDates: string[];     // year/date references: "2025", "March 2024"
}

function extractStructuredInsights(text: string, maxStats = 8, maxBullets = 6): StructuredInsights {
  if (!text || text.length < 40) return { stats: [], bullets: [], keyDates: [] };

  const allStats = extractContextualizedStats(text, maxStats);

  // â”€â”€ Bullets: short factual sentences (20-140 chars, starts with capital) â”€
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 25 && s.length <= 200 && /^[A-Z]/.test(s) && !/^(The page|This site|Click|Please|Cookie|Privacy|Terms|Copyright|Subscribe|Sign|Log)/i.test(s));
  // Score sentences: prefer those with numbers, key verbs, or proper nouns
  const scoredSentences = sentences.map(s => ({
    s,
    score:
      (/\d/.test(s) ? 2 : 0) +
      (/\b(vote|adopt|pass|reject|sanction|impose|call|condemn|support|oppose|agree|sign|ratif|establish|found|declar)/i.test(s) ? 2 : 0) +
      (/\b[A-Z][a-z]+ [A-Z][a-z]+/.test(s) ? 1 : 0) +      // proper nouns
      (s.length > 60 ? 1 : 0),
  })).sort((a, b) => b.score - a.score);
  const bullets = scoredSentences.slice(0, maxBullets).map(x => x.s);

  // â”€â”€ Key dates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dateMatches = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b(?:20\d{2}|19\d{2})\b/g) ?? [];
  const keyDates = [...new Set(dateMatches)].slice(0, 5);

  return { stats: allStats, bullets, keyDates };
}

function extractContextualizedStats(text: string, maxStats = 8): string[] {
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const statsWithContext: string[] = [];

  for (const sentence of sentences) {
    const hasNumber = /\b\d[\d,]*(?:\.\d+)?\s*(?:million|billion|crore|lakh|percent|%|cases|incidents)\b/i.test(sentence);
    if (!hasNumber) continue;

    const hasInstitutionalContext = /\b(india|government|ministry|supreme court|parliament|rbi|cag|ncrb|report|survey|data)\b/i.test(sentence);
    if (!hasInstitutionalContext) continue;

    statsWithContext.push(sentence.slice(0, 200));
    if (statsWithContext.length >= maxStats) break;
  }

  return [...new Set(statsWithContext)];
}

export function formatRagContext(results: EnrichedResult[], query: string, precomputedConflicts?: string[]): string {
  if (results.length === 0) {
    return `## Web Search Results\nNo results found for: "${query}". Answer from your training knowledge but clearly note it may be outdated.`;
  }
  const now = new Date().toISOString().split("T")[0];
  const conflicts = precomputedConflicts ?? detectSourceConflicts(results);
  const conflictBlock = conflicts.length > 0
    ? `\n> **âš ï¸ FACT-CHECK WARNINGS (address these in your response):**\n${conflicts.map((c) => `> ${c}`).join("\n")}\n`
    : "";

  const header = `## Live Web Search â€” Structured Research Data
**Query:** "${query}" | **Retrieved:** ${now} | **Sources:** ${results.length}${conflictBlock}

> **FORMAT INSTRUCTIONS**: Use Key Statistics and Key Findings below. For parliamentary intelligence briefings, analytical paragraphs with citations are preferred over bullet lists. Cite every fact as [Source N](url).

`;

  const body = results.map((r, i) => {
    const freshTag = /\b(2025|2026)\b/.test(r.content || r.snippet) ? " ðŸŸ¢ RECENT" : "";
    const qualityTag = r.score > 0.9 ? " â­ HIGH RELEVANCE" : r.score > 0.7 ? " âœ… GOOD" : "";
    const tierBadge = getSourceTierBonus(r.url) >= 1.0 ? " ðŸ›ï¸ PRIMARY" : getSourceTierBonus(r.url) >= 0.7 ? " ðŸ“° CREDIBLE" : "";
    const text = r.content || r.snippet || "";
    const insights = extractStructuredInsights(text);

    // Numbers-first ordering: stats â†’ court judgement â†’ key findings â†’ dates â†’ prose
    const numbersBlock = insights.stats.length > 0
      ? `ðŸ“Š KEY NUMBERS:\n${insights.stats.map(s => `- ${s}`).join("\n")}`
      : "";

    const judgementBlock = r.judgement?.isJudgement
      ? `âš–ï¸ COURT JUDGEMENT: ${r.judgement.caseName}${r.judgement.year ? ` (${r.judgement.year})` : ""} â€” ${r.judgement.court}${r.judgement.held ? ` â€” ${r.judgement.held.slice(0, 200)}` : ""}`
      : "";

    const findingsBlock = insights.bullets.length > 0
      ? `ðŸ”‘ KEY FINDINGS:\n${insights.bullets.slice(0, 3).map(b => `- ${b}`).join("\n")}`
      : (r.snippet ? `ðŸ”‘ KEY FINDINGS:\n- ${r.snippet.slice(0, 350)}` : "");

    const datesBlock = insights.keyDates.length > 0
      ? `ðŸ“… Dates: ${insights.keyDates.join(", ")}`
      : "";

    const proseExcerpt = text.length > 0
      ? `Context: ${text.slice(0, 280)}`
      : "";

    return [
      `### [${i + 1}] ${r.title}${freshTag}${qualityTag}${tierBadge}`,
      `**URL:** ${r.url} | **Relevance:** ${(r.score * 100).toFixed(0)}%`,
      numbersBlock,
      judgementBlock,
      findingsBlock,
      datesBlock,
      proseExcerpt,
      "---",
    ].filter(Boolean).join("\n\n");
  }).join("\n\n");

  return header + body;
}

export function formatRagContextFromPassages(
  passages: RankedPassage[],
  allResults: SearchResult[] | EnrichedResult[],
  query: string
): string {
  if (passages.length === 0) {
    return `## Web Search Results\nNo results found for: "${query}".`;
  }

  const now = new Date().toISOString().split("T")[0];
  const header = `## Live Web Search â€” Passage-Level Research Data
**Query:** "${query}" | **Retrieved:** ${now} | **Passages:** ${passages.length} from ${allResults.length} sources

> Each passage below is the most relevant excerpt from its source, scored by semantic relevance.
> Cite facts as [Source N](url) using the source index shown.

`;

  const body = passages.map((p) => {
    const result = allResults[p.sourceIndex];
    const badge = result ? sourceBadge(result) : "";
    const score = p.relevanceScore > 1.0
      ? (p.relevanceScore / 1.5) * 100
      : p.relevanceScore * 100;
    return (
      `[Source ${p.sourceIndex + 1}] ${badge}${p.sourceTitle}\n` +
      `URL: ${p.sourceUrl}\n` +
      `Relevance: ${Math.min(100, score).toFixed(0)}%\n` +
      `Excerpt:\n${p.text}\n`
    );
  }).join("\n---\n");

  return header + body;
}

// â”€â”€â”€ Query decomposition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type TopicType =
  | "governance_policy"
  | "legal"
  | "media_press"
  | "democracy_civil_liberties"
  | "sociocultural"
  | "economic"
  | "environment"
  | "security";

export function classifyTopic(query: string): TopicType {
  const q = query.toLowerCase();

  if (/\b(democratic backsliding|democratic erosion|democratic decline|democratic retrenchment|autocratization|shrinking democratic|shrinking civil|democratic space|civil space|civil liberties india|freedom house india|v.?dem|varieties of democracy|eiu democracy index|democracy index india|political freedom india|democratic norms|democratic institutions|electoral authoritarianism|illiberal democracy|competitive authoritarianism|majoritarianism india|minority rights india|dissent india|crackdown on dissent|civil society crackdown|ngos crackdown|fcra india|activists arrested india|opposition arrested|political prisoner india)\b/i.test(q)) return "democracy_civil_liberties";
  if (/\b(cag report|ncrb report|pib release|parliament report|standing committee report)\b/i.test(q)) return "governance_policy";
  if (/\b(press freedom|media freedom|journalist|censorship|rsf|cpj|reporters without borders|shrink(ing)? democratic|shrink(ing)? civil space|shrink(ing)? media|sedition law|sedition charges|sedition section|uapa journalist|section 124|it act journalist|fake news law|crackdown on media|media ownership|media capture|chilling effect|muzzl(ing)? press|silenc(ing)? journalist|defamation journalist|media suppression|free speech crackdown)\b/.test(q)) return "media_press";
  if (/\b(joke|comedy|satire|satirist|stand.?up|meme|humour|humor|blasphemy|offend(ing)? sentiments|hurt religious|art censorship|film ban|book ban|cultural offence|offensive content|why.*(serious|criminal|crime|offence)|speech.*crime|crimin(al|alis(e|z))|comedian arrested)\b/.test(q)) return "sociocultural";
  if (/\b(supreme court|high court|judgement|constitution|article \d+|section \d+|ipc|pocso|crpc|iea|fundamental right|writ|habeas corpus|pil|bail|acquit|verdict|tribunal|bench)\b/.test(q)) return "legal";
  if (/\b(gdp|budget|fiscal|inflation|trade deficit|export|import|rbi|monetary policy|interest rate|currency|forex|gst|tax revenue|growth rate|imf projection|world bank forecast)\b/.test(q)) return "economic";
  if (/\b(climate change|global warming|carbon|emission|pollution|forest|deforestation|biodiversity|coral reef|glacier|net zero|ipcc|cop\d+|paris agreement)\b/.test(q)) return "environment";
  if (/\b(defence|military|armed forces|terrorism|insurgency|border dispute|ceasefire|nuclear|missile|nato|geopolitics|sanctions)\b/.test(q)) return "security";

  return "governance_policy";
}

export async function decomposeQueryByDimension(
  agendaText: string,
  engine: DimensionEngineOutput,
  isDeep: boolean
): Promise<Partial<Record<DimensionName, string[]>>> {
  const queries: Partial<Record<DimensionName, string[]>> = {};
  const { mergedPrimary, absorbedDimensions } = resolveActiveDimensions(engine);

  for (const dim of mergedPrimary) {
    const dimensionQueries = generateDimensionQueries(agendaText, dim, engine.committeeType, isDeep);
    const absorbedForDim = absorbedDimensions.filter((absorbed) => DIMENSION_MERGE_MAP[absorbed] === dim.name);
    const absorbedQueries = absorbedForDim.flatMap((absorbed) => buildAbsorbedDimensionSubQueries(agendaText, absorbed));
    queries[dim.name] = [...dimensionQueries, ...absorbedQueries];
  }

  for (const dim of engine.secondaryDimensions.slice(0, 2)) {
    if (absorbedDimensions.includes(dim.name)) continue;
    queries[dim.name] = generateDimensionQueries(agendaText, dim, engine.committeeType, isDeep).slice(0, 3);
  }

  const deduped = deduplicateAcrossDimensions(queries);
  const cap = isDeep ? 35 : 20;
  const flattenedCount = Object.values(deduped).reduce((sum, items) => sum + (items?.length ?? 0), 0);
  if (flattenedCount <= cap) return deduped;
  logger.warn({ flattenedCount, cap }, "[query-planner] Dimension query cap applied");
  return capDimensionQueries(deduped, cap);
}

const DIMENSION_MERGE_MAP: Partial<Record<DimensionName, DimensionName>> = {
  judiciary: "constitutional",
  international_relations: "diplomatic",
  public_sentiment: "political",
};

export function resolveActiveDimensions(engine: DimensionEngineOutput): {
  mergedPrimary: DimensionScore[];
  absorbedDimensions: DimensionName[];
} {
  const primaryNames = new Set(engine.primaryDimensions.map((dimension) => dimension.name));
  const absorbedDimensions: DimensionName[] = [];
  const mergedPrimary = engine.primaryDimensions.filter((dimension) => {
    const host = DIMENSION_MERGE_MAP[dimension.name];
    if (host && primaryNames.has(host)) {
      absorbedDimensions.push(dimension.name);
      return false;
    }
    return true;
  });
  return { mergedPrimary, absorbedDimensions };
}

function buildAbsorbedDimensionSubQueries(agendaText: string, dimension: DimensionName): string[] {
  const agenda = agendaText.slice(0, 200).trim();
  if (dimension === "judiciary") {
    return [
      `site:indiankanoon.org ${agenda} judgment 2022 2023 2024`,
      `${agenda} LiveLaw Bar and Bench India`,
    ];
  }
  if (dimension === "international_relations") {
    return [
      `${agenda} India UN vote treaty obligation`,
      `${agenda} international pressure India response`,
    ];
  }
  if (dimension === "public_sentiment") {
    return [
      `${agenda} India public opinion protest reaction`,
      `${agenda} opinion poll India political reaction`,
    ];
  }
  return [];
}

function deduplicateAcrossDimensions(
  dimensionQueries: Partial<Record<DimensionName, string[]>>,
  threshold = 0.65,
): Partial<Record<DimensionName, string[]>> {
  const seen: string[] = [];
  const result: Partial<Record<DimensionName, string[]>> = {};
  for (const [dim, queriesForDimension] of Object.entries(dimensionQueries) as [DimensionName, string[]][]) {
    const unique: string[] = [];
    for (const query of queriesForDimension ?? []) {
      const normalized = normalizeQueryForOverlap(query);
      if (seen.every((existing) => getWordOverlap(normalized, existing) < threshold)) {
        unique.push(query);
        seen.push(normalized);
      }
    }
    if (unique.length > 0) result[dim] = unique;
  }
  return result;
}

function capDimensionQueries(
  dimensionQueries: Partial<Record<DimensionName, string[]>>,
  cap: number,
): Partial<Record<DimensionName, string[]>> {
  const result: Partial<Record<DimensionName, string[]>> = {};
  let used = 0;
  for (const [dimension, queriesForDimension] of Object.entries(dimensionQueries) as [DimensionName, string[]][]) {
    if (used >= cap) break;
    const remaining = cap - used;
    result[dimension] = (queriesForDimension ?? []).slice(0, remaining);
    used += result[dimension]?.length ?? 0;
  }
  return result;
}

function normalizeQueryForOverlap(query: string): string {
  return query.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getWordOverlap(a: string, b: string): number {
  const aw = new Set(a.split(/\s+/).filter((word) => word.length > 2));
  const bw = new Set(b.split(/\s+/).filter((word) => word.length > 2));
  if (aw.size === 0 || bw.size === 0) return 0;
  let intersection = 0;
  for (const word of aw) if (bw.has(word)) intersection++;
  return intersection / Math.min(aw.size, bw.size);
}

export function generateDimensionQueries(
  agenda: string,
  dim: DimensionScore,
  _committee: CommitteeType,
  isDeep: boolean
): string[] {
  const q = agenda.slice(0, 200).trim();
  const templates: Record<DimensionName, (query: string) => string[]> = {
    constitutional: (query) => [
      `${query} constitutional validity Article Supreme Court India`,
      `${query} fundamental rights Article 21 19 14 India judgment`,
      `${query} basic structure doctrine India constitutional challenge`,
      `${query} site:indiankanoon.org constitutional bench`,
      `${query} legislative competence India Parliament`,
      `${query} constitutional amendment challenge India`,
    ],
    judiciary: (query) => [
      `${query} Supreme Court India judgment 2022 2023 2024`,
      `${query} High Court India ruling PIL`,
      `site:indiankanoon.org ${query} judgment`,
      `${query} contempt enforcement India court order`,
      `${query} Supreme Court constitutional bench India`,
      `${query} LiveLaw Bar Bench India`,
    ],
    economic: (query) => [
      `${query} India GDP fiscal data NITI Aayog 2024`,
      `${query} Union Budget India revenue expenditure`,
      `${query} RBI India monetary data statistics`,
      `${query} GST revenue India state data 2024`,
      `${query} MoSPI India statistics`,
      `${query} CAG audit fiscal India`,
    ],
    federalism: (query) => [
      `${query} Centre-State dispute India constitutional`,
      `${query} GST Council India state disagreement`,
      `${query} Article 356 Governor India state`,
      `${query} Concurrent List Union State India fiscal`,
      `${query} fiscal devolution Finance Commission India`,
      `${query} state autonomy India Supreme Court`,
    ],
    security: (query) => [
      `${query} India security threat assessment MEA MoD`,
      `${query} AFSPA India armed forces special powers`,
      `${query} India border incident 2023 2024`,
      `${query} SIPRI India military data`,
      `${query} IDSA India security analysis`,
      `${query} internal security India MHA`,
    ],
    human_rights: (query) => [
      `${query} NHRC India human rights commission report`,
      `${query} HRW Amnesty India human rights 2024`,
      `${query} India minority rights protection mechanism`,
      `${query} custodial violence India NCRB data`,
      `${query} Article 21 dignity India Supreme Court`,
      `${query} civil liberties India report`,
    ],
    diplomatic: (query) => [
      `${query} India MEA statement official position`,
      `${query} India bilateral treaty agreement`,
      `${query} India SAARC G20 position diplomatic`,
      `${query} India UN vote resolution diplomatic`,
      `${query} ambassador statement India`,
      `${query} diplomatic crisis India response`,
    ],
    political: (query) => [
      `${query} ruling party India BJP position`,
      `${query} opposition India INC Congress position`,
      `${query} coalition India parliament floor`,
      `${query} India election political implication`,
      `${query} Lok Sabha debate India`,
      `${query} Rajya Sabha debate India`,
    ],
    governance: (query) => [
      `${query} CAG India audit report findings`,
      `${query} India scheme performance PIB data`,
      `${query} accountability transparency India governance`,
      `${query} implementation India ministry report`,
      `${query} parliamentary standing committee report`,
      `${query} government delivery India data`,
    ],
    media_information: (query) => [
      `${query} India press freedom RSF CPJ 2024`,
      `${query} media censorship India sedition IT Act`,
      `${query} journalist arrested India UAPA 2023 2024`,
      `site:rsf.org india ${query}`,
      `${query} misinformation India media ownership`,
      `${query} Article 19 press India Supreme Court`,
    ],
    technological: (query) => [
      `${query} India DPDP Act data protection digital`,
      `${query} Aadhaar UIDAI India data architecture`,
      `${query} India cyber security IT policy`,
      `${query} digital India surveillance framework`,
      `${query} AI governance India policy`,
      `${query} internet shutdown India law`,
    ],
    electoral: (query) => [
      `${query} Election Commission India decision`,
      `${query} EVM India electoral bond controversy`,
      `${query} delimitation India voter rolls`,
      `${query} Model Code of Conduct India election`,
      `${query} campaign finance India Supreme Court`,
      `${query} VVPAT Election Commission India`,
    ],
    social_stability: (query) => [
      `${query} communal harmony India NCRB data`,
      `${query} caste violence India protest movement`,
      `${query} social unrest India government response`,
      `${query} India civil society organization`,
      `${query} riots India state data`,
      `${query} public order India law`,
    ],
    strategic_affairs: (query) => [
      `${query} India strategic autonomy geopolitical`,
      `${query} Quad Indo-Pacific India position`,
      `${query} India China Pakistan strategic balance`,
      `${query} India NSG CTBT NPT strategic`,
      `${query} power projection India`,
      `${query} alliance architecture India foreign policy`,
    ],
    international_relations: (query) => [
      `${query} India UN General Assembly vote resolution`,
      `${query} India ICJ international court position`,
      `${query} India SAARC ASEAN G77 position`,
      `${query} international pressure India response`,
      `${query} diaspora foreign interference India`,
      `${query} treaty obligation India`,
    ],
    public_sentiment: (query) => [
      `${query} India public opinion survey polling`,
      `${query} approval rating government India`,
      `${query} India protest public reaction`,
      `${query} public trust survey India`,
      `${query} opinion poll India`,
      `${query} street opinion India`,
    ],
  };

  return (templates[dim.name]?.(q) ?? [`${q} India ${dim.name.replace(/_/g, " ")} 2024`]).slice(0, isDeep ? 6 : 4);
}

export async function decomposeQuery(
  question: string,
  groqApiKey?: string | null,
  max = 20
): Promise<string[]> {
  const topic = classifyTopic(question);

  function fallbackDecomposition(q: string): string[] {
    switch (topic) {
      case "media_press":
        return [
          q,
          `${q} RSF press freedom index India 2024 2025`,
          `${q} Committee to Protect Journalists India`,
          `${q} Freedom House India democracy score`,
          `${q} MediaNama India press freedom`,
          `${q} sedition UAPA journalists India 2023 2024`,
          `${q} The Wire Scroll ThePrint media freedom India`,
          `${q} Article 19 freedom of speech India Supreme Court`,
        ];
      case "democracy_civil_liberties":
        return [
          q,
          `${q} Freedom House India score 2024 2025 report`,
          `${q} V-Dem varieties of democracy India index`,
          `${q} EIU democracy index India rank 2024`,
          `${q} HRW Human Rights Watch India report 2024`,
          `${q} Amnesty International India annual report`,
          `${q} CIVICUS India civil society monitor`,
          `${q} democratic backsliding India academic analysis`,
          `${q} India opposition arrests UAPA sedition 2023 2024`,
          `${q} Article 14 India democratic erosion data`,
          `${q} RSF India press freedom democratic context`,
          `${q} Supreme Court India civil liberties UAPA judgment`,
          `${q} CAA NRC India minority rights protests`,
          `${q} India democracy comparative V-Dem Polity5`,
        ];
      case "sociocultural":
        return [
          q,
          `${q} sociology of humour cultural theory`,
          `${q} blasphemy sedition law India jokes comedy`,
          `${q} comedian arrested India section 66A IT Act`,
          `${q} free speech limits India jurisprudence`,
          `${q} hate speech versus satire legal framework`,
          `${q} cultural sensitivity censorship India history`,
          `${q} right to humour artistic freedom India court`,
        ];
      case "legal":
        return [
          q,
          `${q} Supreme Court India judgment site:indiankanoon.org`,
          `${q} constitutional article fundamental right India`,
          `${q} High Court ruling India 2023 2024`,
          `${q} PIL India recent verdict`,
          `${q} India statute amendment act Parliament`,
          `${q} comparative constitutional law India`,
          `${q} NHRC India human rights commission`,
        ];
      case "economic":
        return [
          q,
          `${q} India GDP data RBI report 2024 2025`,
          `${q} Union Budget India indiabudget.gov.in`,
          `${q} NITI Aayog India economic data`,
          `${q} IMF India economic outlook 2025`,
          `${q} World Bank India poverty data`,
          `${q} MoSPI India statistical data`,
          `${q} India trade export import data 2024`,
        ];
      case "environment":
        return [
          q,
          `${q} India climate policy MoEFCC`,
          `${q} India NDC Paris Agreement target`,
          `${q} pollution data India CPCB`,
          `${q} IPCC India climate change impact`,
          `${q} India forest cover FSI report`,
          `${q} India renewable energy MNRE data`,
          `${q} India environmental law court order`,
        ];
      case "security":
        return [
          q,
          `${q} India official statement MEA defence`,
          `${q} SIPRI India military data`,
          `${q} India UN peacekeeping operations`,
          `${q} India border policy official stance`,
          `${q} India security council position`,
          `${q} India counter-terrorism framework`,
          `${q} India strategic affairs IDSA`,
        ];
      default:
        return [
          q,
          `${q} India official position MEA statement`,
          `${q} UN Security Council resolution voting`,
          `${q} recent developments 2025 2024`,
          `${q} international law framework treaty`,
          `${q} G77 Non-Aligned Movement bloc position`,
          `${q} humanitarian impact data statistics`,
          `${q} P5 countries stance China Russia USA`,
        ];
    }
  }

  const limit = max;
  const fallback = () => fallbackDecomposition(question).slice(0, limit);

  try {
    const { default: Groq } = await import("groq-sdk");
    const key = (groqApiKey ?? "").trim() || (process.env.GROQ_API_KEY ?? "");
    if (!key) return fallback();

    const groq = new Groq({ apiKey: key });
    const topicInstructions: Record<TopicType, string> = {
      governance_policy: "Cover definition, India/MEA position, UN resolutions, recent 2024-2025 developments, blocs, treaties, impact data, and counterarguments.",
      media_press: "Cover RSF/Freedom House/CPJ rankings, journalist incidents, sedition/UAPA/IT Act/defamation, Article 19 judgements, comparative data, PIB response, civil society reactions, and 5-10 year trends.",
      democracy_civil_liberties: "Cover Freedom House, V-Dem, EIU, HRW, Amnesty, CIVICUS, Article 14, named incidents, UAPA/sedition/civil society crackdowns, judicial responses, government counter-narrative, and comparative democracy trends.",
      sociocultural: "Cover comedians/satirists cases, 295A/sedition/66A/free speech law, satire vs offence judgements, sociology of humour, democratic comparisons, historical examples, Article 19, and 2023-2025 cases.",
      legal: "Cover Supreme Court and High Court judgements, constitutional articles, statutory sections, PIL history, law commission material, parliamentary history, NHRC reports, comparative law, and 2024-2025 judicial developments.",
      economic: "Cover GDP, budget, trade, fiscal policy, RBI, MoSPI, Union Budget, NITI Aayog, IMF, World Bank, and current India data.",
      environment: "Cover climate, pollution, forests, MoEFCC, CPCB, FSI, MNRE, NDCs, IPCC, Paris Agreement, and environmental court orders.",
      security: "Cover defence, terrorism, borders, conflict, MEA/MoD statements, SIPRI, IDSA, UN peacekeeping, Security Council context, and India strategic positions.",
    };
    const queryCharLimit = topic === "democracy_civil_liberties" ? 90 : 70;
    const plannerModel = (topic === "democracy_civil_liberties" || topic === "media_press")
      ? "llama-3.3-70b-versatile"
      : "llama-3.1-8b-instant";
    const prompt = `You are a research strategist. Break this question into ${limit} specific web search sub-queries.

Topic type detected: ${topic}

${topicInstructions[topic]}

MANDATORY RULES:
- Every query MUST be under ${queryCharLimit} characters. Keywords only, no essay titles.
- Include year ranges "2022 2023 2024 2025" in statistical queries.

Return ONLY a valid JSON array of strings. No preamble, no markdown.

Research question: ${question}`;
    console.info(`[rag] planner model=${plannerModel} topic=${topic} queryCharLimit=${queryCharLimit}`);
    const resp = await groq.chat.completions.create({
      model: plannerModel,
      max_tokens: 800,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return fallback();
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validated = (parsed as string[])
        .filter((s) => typeof s === "string")
        .map(s => s.trim().slice(0, queryCharLimit))
        .filter(s => s.length > 5)
        .slice(0, limit);
      return validated.length > 0 ? validated : fallback();
    }
    return fallback();
  } catch {
    return fallback();
  }
}

/**
 * Build a system prompt for web/deep search modes.
 * Section 4 rewrite: Indian MUN identity, strict source priority, data-first mandate.
 */
export function buildSearchSystem(
  type: "web" | "deep",
  userSystemPrompt = "",
  topicType?: TopicType
): string {
  const today = new Date().toISOString().split("T")[0];

  const INDIA_MUN_IDENTITY = `You are BestDel â€” an expert MUN research assistant built specifically for INDIAN Model United Nations conferences and delegates.

## YOUR CORE IDENTITY
- You serve Indian MUN students at conferences like HMUN India, SPECMUN, DAIMUN, SCMUN, college MUNs across India
- You represent India's perspective by default unless explicitly asked for another country
- You are deeply familiar with India's constitutional framework, domestic law, and international positions

## WHAT YOU PRIORITIZE (in strict order):
1. **CAG Reports** (Comptroller and Auditor General) â€” audit findings, scheme performance
2. **NCRB Data** (National Crime Records Bureau) â€” crime statistics, state-wise data
3. **PIB Press Releases** â€” official government positions, ministry statements
4. **MEA Official Statements** â€” India's foreign policy, diplomatic notes
5. **Supreme Court and High Court Judgements** â€” from indiankanoon.org, sci.gov.in, livelaw.in
6. **Parliamentary Standing Committee Reports** â€” from prsindia.org or sansad.in
7. **NITI Aayog Reports** â€” policy papers, SDG data, development indicators
8. **UN Official Documents** â€” resolutions, reports, treaty bodies
9. **Indian Academic Research** â€” EPW, IDSA, ICRIER, CPR India
10. **Quality Indian Media** â€” The Hindu, Indian Express, Live Mint (for context only, never for statistics)

## WHAT YOU NEVER CITE AS FACTS:
- Social media posts, tweets, Instagram
- Medium/Substack opinion pieces
- Quora, Reddit, Yahoo Answers
- Wikipedia for statistics (only for definitions)
- Anonymous blogs

## YOUR FORMATTING MANDATE:
Every response in web_search or deep_research mode MUST follow this structure:
1. Lead with statistics (numbers, percentages, absolute counts)
2. Follow with court judgements if applicable
3. Then official government positions
4. Then analysis
5. Every claim = one citation minimum
6. Prefer compact bullet points over paragraphs; use paragraphs only for unavoidable nuance
7. Keep each bullet to one claim, one citation, and one clear implication for MUN prep`;

  const TOPIC_OVERLAY: Partial<Record<TopicType, string>> = {
    media_press: `
## TOPIC OVERRIDE: PRESS FREEDOM / MEDIA ENVIRONMENT
For this topic, your source priority order changes:
1. RSF Press Freedom Index - cite rank and score
2. CPJ incident data
3. Freedom House democracy and press freedom score
4. Human Rights Watch / Amnesty International documented incidents
5. MediaNama, The Wire, Scroll.in India-specific media analysis
6. Supreme Court judgements on Article 19 via indiankanoon.org
7. Indian government statements via PIB - treat as one side of the debate only
8. NCRB data on journalist attacks if available

Never lead with CAG or NCRB data for this topic unless directly relevant.
Always present government data as the official government's position, not as fact.`,
    democracy_civil_liberties: `
## TOPIC OVERRIDE: DEMOCRATIC BACKSLIDING / CIVIL LIBERTIES / DEMOCRATIC SPACE

This is an investigative research topic â€” you are examining the STATE OF DEMOCRACY,
not reporting the government's agenda. The Indian government is the SUBJECT OF SCRUTINY,
not the primary evidence source.

### YOUR SOURCE HIERARCHY FOR THIS TOPIC (strict order):
1. **Freedom House** â€” "Freedom in the World" India score, year-on-year trend, sub-scores
2. **V-Dem Institute** â€” Liberal Democracy Index, Electoral Democracy Index for India
3. **EIU Democracy Index** â€” India rank, category (flawed democracy / hybrid), score trend
4. **Human Rights Watch** â€” India country reports, documented incidents
5. **Amnesty International** â€” India reports (note: Amnesty India was shut down in 2020 â€” cite this fact)
6. **CIVICUS Monitor** â€” India civil society space rating
7. **Article 14** (article14.com) â€” India-specific data journalism on democratic erosion
8. **RSF / CPJ** â€” press freedom as one dimension of democratic health
9. **Supreme Court of India** â€” judgements on UAPA, sedition, Article 19, internet shutdowns
10. **Academic research** â€” EPW, V-Dem working papers, SSRN comparative politics

### HOW TO PRESENT GOVERNMENT DATA:
- Government statements are the GOVERNMENT'S POSITION â€” label them explicitly as such
- PIB press releases are official government spin â€” cite them only as "the government claims..."
- CAG / NCRB are irrelevant to this topic unless specifically about electoral fraud data or protest statistics
- NEVER lead with PIB or MEA as evidence that democracy is healthy

### MANDATORY STRUCTURE FOR THIS TOPIC:
1. **International Index Scores** â€” Freedom House, V-Dem, EIU numbers with year-on-year trend
2. **Documented Incidents** â€” named cases, arrests, shutdowns, with dates and sources
3. **Judicial Responses** â€” SC/HC judgments on UAPA, sedition, internet, minorities
4. **Civil Society Assessment** â€” HRW, Amnesty, Civicus findings
5. **Government Counter-Narrative** â€” official position, labeled explicitly as the government's claim
6. **Comparative Context** â€” India vs peer democracies on the same indices

### DO NOT do these things for this topic:
- Do NOT open with "Key Statistics & Data" containing budget figures or NCRB crime counts
- Do NOT include a "Government Scheme Performance" section
- Do NOT open "India's Official Position" as if the government is a neutral authority
- Do NOT cite CAG renewable energy or FAME scheme data
`,
    sociocultural: `
## TOPIC OVERRIDE: SOCIOCULTURAL / HUMOUR / SATIRE
For this topic, your source priority order changes:
1. Court judgements on sedition, 295A IPC, hurt sentiments
2. Academic analysis from SSRN, EPW, JSTOR on law and satire
3. Documented incidents involving comedians, satirists, artists or authors
4. Legal commentary from LiveLaw and Bar & Bench
5. Article 19 jurisprudence on acceptable speech
6. Comparative democratic handling of offensive humour
7. Cultural/sociological frameworks for why satire is policed

Never treat this as a default governance/MUN topic. Do not lead with CAG or MEA data.`,
  };
  const topicBlock = topicType && TOPIC_OVERLAY[topicType] ? `\n${TOPIC_OVERLAY[topicType]}\n` : "";
  const democracySynthesisConstraints = topicType === "democracy_civil_liberties"
    ? `
## SYNTHESIS CONSTRAINTS - THESE SECTIONS ARE FORBIDDEN IN YOUR OUTPUT:
- "## India's Official Position" (as a neutral section)
- "## Government's Stance" (as a neutral section)
- Any "Key Statistics" section opening with budget, NCRB crime, or scheme data
- Government statements MUST be labeled: "Government's claim (not verified by independent indices):"`
    : "";

  const isGovCritiqueTopic = topicType === "media_press" || topicType === "democracy_civil_liberties";
  const isGovDataTopic = topicType === "governance_policy" || topicType === "economic" || topicType === "environment";

  const rule4 = isGovCritiqueTopic
    ? `4. **INDEX DATA REQUIRED**: If Freedom House / V-Dem / HRW sources exist, cite their specific score, rank, and year. Do NOT cite CAG or PIB as evidence for this topic.`
    : isGovDataTopic
      ? `4. **GOVERNMENT REPORTS REQUIRED**: If CAG/NCRB/PIB sources exist, quote their specific findings`
      : `4. **GOVERNMENT REPORTS REQUIRED**: If CAG/NCRB/PIB sources exist, quote their specific findings`;

  const rule6 = isGovCritiqueTopic
    ? `6. **WATCHDOG LENS**: Even for legal sub-topics, include civil society or international assessments â€” not just official Indian government positions`
    : `6. **INDIA LENS**: Even for international topics, include India's position, India's vote, or India's relevant domestic law`;

  const WEB_SEARCH_RULES = `
## WEB SEARCH MODE MANDATORY RULES:
1. **DATA FIRST**: Your first section must be "Key Statistics & Data" with at least 5 bullet points of numbers
2. **CITE EVERY NUMBER**: Format: [Source N](exact_url) â€” never state a number without its source
3. **COURT JUDGEMENTS REQUIRED**: If ANY court judgement was found in sources, include a "Legal Framework" section
${rule4}
5. **NO FABRICATION**: If you don't have a number cited, don't estimate â€” say "data not available in current sources"
${rule6}
7. **RECENCY SIGNAL**: Sources from 2024-2025 get priority; always note the year of data
8. **BULLET-FIRST**: Use bullet lists for nearly all output. Limit narrative paragraphs to 2 short paragraphs total.
9. **SCANABILITY**: Put the most useful answer in the first 8 bullets before any detailed analysis.

## CITATION FORMAT:
- For government reports: [CAG Report 2024](url) or [NCRB Crime in India 2023](url)
- For court judgements: [Maneka Gandhi v. Union of India (1978)](url)
- For PIB: [PIB Official Release, Ministry of X](url)
- For general: [Source N](url)

## FORBIDDEN PHRASES (never use these):
- "According to reports..." â†’ always name the specific report
- "Studies show..." â†’ cite the specific study
- "It is estimated..." â†’ cite who estimated it and when
- "Many experts believe..." â†’ name the expert and source`;


  const DEEP_RESEARCH_EXTRA = type === "deep"
    ? topicType === "democracy_civil_liberties" || topicType === "media_press"
      ? `
## DEEP RESEARCH MODE â€” DEMOCRATIC / CIVIL LIBERTIES TOPICS:
1. **EXECUTIVE SUMMARY** (3-5 sentences, every sentence cited from index/watchdog sources)
2. **INDEX SCORES & TRENDS** â€” Freedom House, V-Dem, EIU: India's score, rank, trend over 5 years
3. **DOCUMENTED INCIDENTS** â€” named cases (journalists, activists, NGOs), with dates, charges, outcomes
4. **JUDICIAL LANDSCAPE** â€” SC/HC judgments on UAPA, sedition 124A, internet shutdowns, minorities
5. **CIVIL SOCIETY ASSESSMENT** â€” HRW, Amnesty, Civicus, Article 14 findings
6. **GOVERNMENT COUNTER-NARRATIVE** â€” official claims, labeled explicitly as the government's position
7. **KNOWLEDGE GAPS** â€” what sources did NOT cover
8. **FOLLOW-UP QUERIES** â€” 3 specific queries for deeper research

Minimum: 800 words. Maximum: 2000 words.

## Dig Deeper
Add at the end: 3 follow-up queries:
- [Specific index score or incident name to verify]
- [The government's strongest counter-argument to investigate]
- [A comparative case â€” another democracy that reversed backsliding]`
      : `
## DEEP RESEARCH MODE â€” ADDITIONAL REQUIREMENTS:
1. **EXECUTIVE SUMMARY** (3-5 sentences, every sentence cited)
2. **STATISTICAL LANDSCAPE** â€” all numbers found, organized by sub-topic
3. **LEGAL FRAMEWORK** â€” constitutional articles, Acts, court precedents
4. **GOVERNMENT SCHEME PERFORMANCE** â€” CAG findings, audit results if relevant
5. **INDIA AT THE UN** â€” voting history, resolutions cosponsored, statements
6. **KNOWLEDGE GAPS** â€” what the sources did NOT cover
7. **FOLLOW-UP QUERIES** â€” 3 specific queries for further research

Minimum: 800 words. Maximum: 2000 words.

## Dig Deeper
Add at the end: 3 follow-up queries:
- [Most important unresolved angle]
- [A counterargument or opposing viewpoint]
- [A specific data point, case name, or resolution number to look up]`
    : "";

  const base = `${INDIA_MUN_IDENTITY}${topicBlock}${democracySynthesisConstraints}\n\nToday's date: ${today}\n\n${WEB_SEARCH_RULES}${DEEP_RESEARCH_EXTRA}`;

  const trimmed = (userSystemPrompt ?? "").trim();
  if (!trimmed) return base;
  return `${base}\n\n--- Delegate's custom instructions (apply on top of above rules) ---\n${trimmed}\n--- end ---`;
}

export function countCitations(text: string): number {
  const urls = new Set<string>();
  const re = /\[Source\s*\d+\]\((https?:\/\/[^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) urls.add(canonicalizeUrl(m[1]));
  const re2 = /\[(\d+)\]\((https?:\/\/[^)]+)\)/gi;
  while ((m = re2.exec(text)) !== null) urls.add(canonicalizeUrl(m[2]));
  return urls.size;
}

