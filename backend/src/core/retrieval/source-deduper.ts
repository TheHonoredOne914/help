import { canonicalizeUrl } from "../evidence/evidence-registry.js";
import { retrievalCacheManager } from "../retrieval-cache/index.js";

export function dedupeSourcesByCanonicalUrl<T extends { url: string; title?: string; snippet?: string; bucketIds?: string[]; foundByQueries?: string[]; discoveredBy?: string[]; score?: number }>(sources: T[]): T[] {
  const merged = new Map<string, T>();
  for (const source of sources) {
    const key = canonicalizeUrl(source.url);
    const cacheIdentifier = normalizedSourceIdentifier(source);
    const existing = merged.get(key);
    if (!existing) {
      const cached = retrievalCacheManager.getNormalizedSource<T>(key, cacheIdentifier);
      const normalized = cached ? { ...cached, ...source, url: key } : { ...source, url: key };
      merged.set(key, normalized);
      retrievalCacheManager.writeNormalizedSource(key, normalized, cacheIdentifier);
      continue;
    }
    const normalized = {
      ...existing,
      ...source,
      url: key,
      bucketIds: [...new Set([...(existing.bucketIds ?? []), ...(source.bucketIds ?? [])])],
      foundByQueries: [...new Set([...(existing.foundByQueries ?? []), ...(source.foundByQueries ?? [])])],
      discoveredBy: [...new Set([...(existing.discoveredBy ?? []), ...(source.discoveredBy ?? [])])],
      score: Math.max(existing.score ?? 0, source.score ?? 0),
    };
    merged.set(key, normalized);
    retrievalCacheManager.writeNormalizedSource(key, normalized, cacheIdentifier);
  }
  return [...merged.values()];
}

function normalizedSourceIdentifier(source: { title?: string; snippet?: string }): string | undefined {
  const text = `${source.title ?? ""}\n${source.snippet ?? ""}`.replace(/\s+/g, " ").trim().toLowerCase();
  return text ? text.slice(0, 240) : undefined;
}

export function dedupeByContentSimilarity<T extends { url: string; title?: string; snippet?: string; score?: number; authorityScore?: number; duplicateOf?: string[] }>(
  sources: T[],
  threshold = 0.82,
): T[] {
  const kept: T[] = [];
  const titleIndex = new Map<string, T>();
  for (const source of sources) {
    const normalizedTitle = normalizeTitle(source.title ?? "");
    const titleDuplicate = normalizedTitle ? titleIndex.get(normalizedTitle) : undefined;
    const duplicate = titleDuplicate ?? kept.find((candidate) => jaccard(shingles(candidate), shingles(source)) >= threshold);
    if (!duplicate) {
      const next = { ...source, duplicateOf: source.duplicateOf ?? [] };
      kept.push(next);
      if (normalizedTitle) titleIndex.set(normalizedTitle, next);
      continue;
    }
    const duplicateScore = duplicate.authorityScore ?? duplicate.score ?? 0;
    const sourceScore = source.authorityScore ?? source.score ?? 0;
    const duplicateUrls = [...(duplicate.duplicateOf ?? []), source.url];
    if (sourceScore > duplicateScore) {
      const index = kept.indexOf(duplicate);
      kept[index] = { ...source, duplicateOf: [...(source.duplicateOf ?? []), duplicate.url, ...(duplicate.duplicateOf ?? [])] };
      if (normalizedTitle) titleIndex.set(normalizedTitle, kept[index]);
    } else {
      duplicate.duplicateOf = duplicateUrls;
    }
  }
  return kept;
}

function shingles(source: { title?: string; snippet?: string }): Set<string> {
  const extended = (source as any).fullText ?? (source as any).excerpt ?? "";
  const text = `${source.title ?? ""} ${(source.snippet ?? "").slice(0, 900)} ${String(extended).slice(0, 1200)}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const grams = new Set<string>();
  for (let index = 0; index < words.length - 2; index += 1) {
    grams.add(words.slice(index, index + 3).join(" "));
  }
  if (grams.size === 0 && text) grams.add(text);
  return grams;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase()
    .replace(/\b(latest|explained|live updates?|opinion|analysis)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
