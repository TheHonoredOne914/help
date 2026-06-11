import { EventEmitter } from "node:events";
import { enrichResults, canonicalizeUrl, formatRagContext } from "../lib/rag.js";
import { searchWeb, searchWebDeep } from "../lib/web-search.js";
import { logger } from "../lib/logger.js";
import type { EnrichedResult, SearchResult } from "../lib/types.js";
import type { TopicType } from "../lib/rag.js";

export interface RetrievalConfig {
  topN: number;
  maxQueriesPerRole: number;
  concurrency: number;
}

export interface RetrievalPipelineOptions {
  keys?: { tavilyKey?: string | null; serperKey?: string | null; braveKey?: string | null };
  jinaKey?: string | null;
  topic?: TopicType;
  deep?: boolean;
  search?: (query: string) => Promise<SearchResult[]>;
  queryPriorities?: Record<string, "primary" | "secondary">;
}

export class RetrievalPipeline extends EventEmitter {
  constructor(private readonly config: RetrievalConfig) {
    super();
  }

  async run(queries: string[], opts: RetrievalPipelineOptions = {}): Promise<{ results: EnrichedResult[]; ragContext: string }> {
    const queryPool = orderQueriesByPriority(
      deduplicateQueriesSemantically(queries).slice(0, this.config.maxQueriesPerRole),
      opts.queryPriorities ?? {},
    );
    const search = opts.search ?? ((query: string) =>
      opts.deep ? searchWebDeep(query, opts.keys, opts.topic) : searchWeb(query, opts.keys, opts.topic));

    const rawResults: SearchResult[] = [];
    await runWeightedQueries(queryPool, this.config.concurrency, opts.queryPriorities ?? {}, async (query) => {
      this.emit("progress", { searching: query });
      const found = await search(query).catch(() => []);
      rawResults.push(...found);
      this.emit("progress", { query, found: found.length });
    });

    if (rawResults.length === 0 && queryPool.length > 0) {
      logger.error({
        queries: queryPool,
        deep: opts.deep,
        hasKeys: Boolean(opts.keys?.tavilyKey || opts.keys?.braveKey || opts.keys?.serperKey),
      }, "[retrieval] CRITICAL: Zero results from all queries. Check API key configuration.");
      this.emit("progress", { zeroResults: true, queriesAttempted: queryPool.length });
    }

    const merged = mergeSearchResults(rawResults);
    const enriched = await enrichResults(merged, queryPool.join("\n"), this.config.topN, (i, total, url) => {
      this.emit("progress", { fetched: { i, total, url } });
    }, opts.jinaKey, opts.deep ? "deep" : "web", opts.deep ? 15 : 0) as EnrichedResult[];

    return { results: enriched, ragContext: formatRagContext(enriched, queryPool[0] ?? "") };
  }
}

async function runWeightedQueries<T>(
  items: T[],
  concurrency: number,
  priorities: Record<string, "primary" | "secondary">,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const primary = items.filter((item) => priorities[String(item)] !== "secondary");
  const secondary = items.filter((item) => priorities[String(item)] === "secondary");
  await Promise.all([
    runWithConcurrency(primary, Math.min(concurrency, 2), fn),
    runWithConcurrency(secondary, Math.min(concurrency, 1), fn),
  ]);
}

function orderQueriesByPriority<T>(items: T[], priorities: Record<string, "primary" | "secondary">): T[] {
  return [...items].sort((a, b) => {
    const ap = priorities[String(a)] === "secondary" ? 1 : 0;
    const bp = priorities[String(b)] === "secondary" ? 1 : 0;
    return ap - bp;
  });
}

export function mergeSearchResults(results: SearchResult[]): SearchResult[] {
  const merged = new Map<string, SearchResult>();
  for (const result of results) {
    const key = canonicalizeUrl(result.url);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...result });
      continue;
    }
    merged.set(key, {
      ...existing,
      title: existing.title || result.title,
      snippet: [existing.snippet, result.snippet].filter(Boolean).join(" ").trim().slice(0, 1000),
      score: Math.max(existing.score, result.score),
      sourceType: existing.sourceType ?? result.sourceType,
      reportType: existing.reportType ?? result.reportType,
      judgement: existing.judgement ?? result.judgement,
      engine: existing.engine ?? result.engine,
    });
  }
  return [...merged.values()];
}

export function mergeEnrichedResults(results: EnrichedResult[]): EnrichedResult[] {
  const merged = new Map<string, EnrichedResult>();
  for (const result of results) {
    const key = canonicalizeUrl(result.url);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...result });
      continue;
    }
    merged.set(key, {
      ...existing,
      title: existing.title || result.title,
      snippet: [existing.snippet, result.snippet].filter(Boolean).join(" ").trim().slice(0, 1000),
      content: (existing.content?.length ?? 0) >= (result.content?.length ?? 0)
        ? existing.content
        : result.content,
      score: Math.max(existing.score ?? 0, result.score ?? 0),
      relevanceScore: Math.max(existing.relevanceScore ?? 0, result.relevanceScore ?? 0),
      combinedScore: Math.max(existing.combinedScore ?? 0, result.combinedScore ?? 0),
      sourceType: existing.sourceType ?? result.sourceType,
      reportType: existing.reportType ?? result.reportType,
      judgement: existing.judgement ?? result.judgement,
      engine: existing.engine ?? result.engine,
    });
  }
  return [...merged.values()];
}

export function extractNumericalStats(results: EnrichedResult[]): { numbers: string[]; percentages: string[]; years: string[] } {
  const allText = results.map(r => r.content || r.snippet).join(" ");
  return {
    numbers: [...new Set(allText.match(/\b\d[\d,]*(?:\.\d+)?\s*(?:crore|lakh|million|billion|cases|incidents)\b/gi) ?? [])].slice(0, 10),
    percentages: [...new Set(allText.match(/\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\spercent\b/gi) ?? [])].slice(0, 10),
    years: [...new Set(allText.match(/\b(?:20\d{2}|19\d{2})\b/g) ?? [])].slice(0, 10),
  };
}

export function deduplicateQueriesSemantically(queries: string[], threshold = 0.70): string[] {
  const normalized = queries.map(q => q.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim());
  const selected: number[] = [];
  for (let i = 0; i < normalized.length; i++) {
    if (selected.every(j => getWordOverlap(normalized[i], normalized[j]) < threshold)) selected.push(i);
  }
  return selected.map(i => queries[i]);
}

export function getWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(" ").filter(w => w.length > 3));
  const wordsB = new Set(b.split(" ").filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  return intersection / Math.min(wordsA.size, wordsB.size);
}

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
