import type { NormalizedSearchResult, SearchProviderName } from "./search-provider-types.js";

export function normalizeSearchResults(
  provider: SearchProviderName,
  payload: unknown,
  context: { query: string; bucketId?: string; retrievedAt?: string },
): NormalizedSearchResult[] {
  const retrievedAt = context.retrievedAt ?? new Date().toISOString();
  const items = rawItems(provider, payload);
  return items.map((item, index) => {
    const url = canonicalizeSearchUrl(String(item.url ?? item.link ?? ""));
    return {
      id: `${provider}-${hashId(`${context.query}:${url}:${index}`)}`,
      provider,
      title: String(item.title ?? item.name ?? url),
      url,
      snippet: stringOrUndefined(item.snippet ?? item.content ?? item.text ?? item.description),
      publishedDate: stringOrUndefined(item.publishedDate ?? item.published_date ?? item.date ?? item.publishedDateString),
      author: stringOrUndefined(item.author),
      sourceName: stringOrUndefined(item.source ?? item.sourceName),
      rawRank: index + 1,
      semanticScore: typeof item.score === "number" && provider === "exa" ? item.score : undefined,
      providerScore: typeof item.score === "number" ? item.score : undefined,
      bucketId: context.bucketId,
      query: context.query,
      retrievedAt,
      metadata: { discoveredBy: [provider] },
    };
  }).filter((item) => item.url && item.url !== "unknown");
}

export function mergeSearchResultsByUrl(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
  const merged = new Map<string, NormalizedSearchResult>();
  for (const result of results) {
    const key = canonicalizeSearchUrl(result.url);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...result, url: key, metadata: { ...(result.metadata ?? {}), discoveredBy: discoveredBy(result) } });
      continue;
    }
    const providers = [...new Set([...discoveredBy(existing), ...discoveredBy(result)])];
    merged.set(key, {
      ...existing,
      title: existing.title || result.title,
      snippet: longer(existing.snippet, result.snippet),
      publishedDate: existing.publishedDate ?? result.publishedDate,
      semanticScore: Math.max(existing.semanticScore ?? 0, result.semanticScore ?? 0) || undefined,
      providerScore: Math.max(existing.providerScore ?? 0, result.providerScore ?? 0) || undefined,
      metadata: { ...(existing.metadata ?? {}), ...(result.metadata ?? {}), discoveredBy: providers },
    });
  }
  return [...merged.values()];
}

export function canonicalizeSearchUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|fbclid|gclid|mc_cid|mc_eid/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hostname = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^amp\./, "").toLowerCase();
    const out = parsed.toString().replace(/\/$/, "");
    return out;
  } catch {
    return url.trim() || "unknown";
  }
}

function rawItems(provider: SearchProviderName, payload: unknown): any[] {
  const data = (payload ?? {}) as any;
  if (provider === "serper") return [...(data.organic ?? []), ...(data.news ?? [])].map((item) => ({ ...item, url: item.link ?? item.url }));
  if (provider === "exa") return (data.results ?? data.data ?? []).map((item: any) => ({ ...item, snippet: item.text ?? item.snippet, url: item.url }));
  if (provider === "tavily") return (data.results ?? []).map((item: any) => ({ ...item, snippet: item.content ?? item.snippet, url: item.url }));
  if (provider === "brave") return (data.web?.results ?? data.results ?? []).map((item: any) => ({ ...item, snippet: item.description ?? item.snippet, url: item.url }));
  return [];
}

function discoveredBy(result: NormalizedSearchResult): string[] {
  const value = result.metadata?.discoveredBy;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [result.provider];
}

function longer(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hashId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
