import { createHash } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function shortHash(value: string): string {
  return sha256Hex(value).slice(0, 24);
}

export function canonicalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return canonicalizeUrl(`https:${trimmed}`);
  if (/^[/?#]/.test(trimmed)) return `relative:${sha256Hex(trimmed)}`;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return `raw:${sha256Hex(trimmed.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase())}`;
  }
}

export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\b(please|kindly)\b/g, " ")
    .replace(/[?!.,;:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function retrievalCacheKey(parts: Array<string | number | boolean | null | undefined>): string {
  return sha256Hex(parts.map((part) => String(part ?? "")).join("\u001f"));
}

export function searchResultCacheKey(input: { schemaVersion: number; provider: string; query: string; mode?: string; topicType?: string; bucket?: string; maxResults?: number }): string {
  return retrievalCacheKey(["search_result", input.schemaVersion, input.provider, normalizeQuery(input.query), input.mode, input.topicType, input.bucket, input.maxResults]);
}

export function urlExtractionCacheKey(input: { schemaVersion: number; provider?: string; url: string; freshness?: string }): string {
  return retrievalCacheKey(["url_extraction", input.schemaVersion, canonicalizeUrl(input.url)]);
}

export function normalizedSourceCacheKey(input: { schemaVersion: number; url: string; identifier?: string }): string {
  return retrievalCacheKey(["normalized_source", input.schemaVersion, canonicalizeUrl(input.url), input.identifier]);
}

export function evidenceReadyCacheKey(input: { schemaVersion: number; sourceId?: number | string; url?: string; contentHash?: string; agendaFingerprint?: string }): string {
  if (!input.contentHash) throw new Error("evidenceReadyCacheKey requires a non-empty contentHash");
  return retrievalCacheKey(["evidence_ready", input.schemaVersion, input.sourceId ?? "", input.url ? canonicalizeUrl(input.url) : "", input.contentHash, input.agendaFingerprint ?? "global"]);
}

export function providerHealthCacheKey(input: { schemaVersion: number; provider: string; stage: "search" | "extraction"; scope?: string }): string {
  return retrievalCacheKey(["provider_health", input.schemaVersion, input.provider, input.stage, input.scope ?? "global"]);
}
