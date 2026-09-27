import type { ExtractorProviderAvailability, ExtractionProviderName, SearchOnlyProviderName, SearchPolicyMode, SearchProviderAvailability } from "./search-provider-types.js";

export function getSearchProviderOrder(_mode: SearchPolicyMode, available: SearchProviderAvailability): SearchOnlyProviderName[] {
  const base: SearchOnlyProviderName[] = ["serper", "exa", "tavily", "brave"];
  return base.filter((provider) => available[provider]);
}

/** Bucket-aware primary→secondary order for hedged search. */
export function getSearchProviderOrderForBucket(
  bucketId: string | undefined,
  _mode: SearchPolicyMode | undefined,
  available: SearchProviderAvailability,
): SearchOnlyProviderName[] {
  const bucketMode = searchModeForBucket(bucketId);
  let preferred: SearchOnlyProviderName[];
  if (bucketMode === "legal" || bucketMode === "official") preferred = ["serper", "exa", "tavily", "brave"];
  else if (bucketMode === "news") preferred = ["serper", "brave", "tavily", "exa"];
  else if (bucketMode === "academic" || bucketMode === "semantic") preferred = ["exa", "serper", "tavily", "brave"];
  else preferred = ["serper", "exa", "tavily", "brave"];
  return preferred.filter((provider) => available[provider]);
}

export type ExtractionUrlClass = "gov_static" | "paywalled" | "default";

const PAYWALL_HOST = /(ft\.com|wsj\.com|bloomberg\.com|economist\.com|nytimes\.com|washingtonpost\.com|hindustantimes\.com|telegraph\.co\.uk)/i;
const GOV_STATIC_HOST = /(sci\.gov\.in|indiankanoon|prsindia|sansad|eci\.gov\.in|egazette|pib\.gov\.in|legislative\.gov\.in|\.nic\.in|\.gov\.in)/i;

export function classifyExtractionUrl(url: string): ExtractionUrlClass {
  const lower = url.toLowerCase();
  try {
    const host = new URL(url).hostname;
    if (PAYWALL_HOST.test(host)) return "paywalled";
  } catch { /* ignore */ }
  // Do NOT classify every .pdf as gov_static: that made Firecrawl escalate-only for
  // livelaw/scobserver/adrindia PDFs, which dominate live snippet_fallback after Jina miss.
  if (GOV_STATIC_HOST.test(lower)) return "gov_static";
  return "default";
}

export function isPdfExtractionUrl(url: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(url);
}

export function ampUrlVariant(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.startsWith("amp.")) return null;
    if (parsed.pathname.includes("/amp")) return null;
    parsed.hostname = `amp.${parsed.hostname.replace(/^www\./, "")}`;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function waybackAvailabilityUrl(url: string): string {
  return `https://web.archive.org/web/${encodeURIComponent(url)}`;
}

/**
 * URL-class extraction order: jina first; firecrawl only when escalateFirecrawl (JS-shell);
 * paid scrapers last; snippet_fallback last. Local extract runs in enrich-source for gov_static.
 */
export function getExtractionProviderOrder(
  available: ExtractorProviderAvailability,
  options: { url?: string; escalateFirecrawl?: boolean } = {},
): ExtractionProviderName[] {
  const order: ExtractionProviderName[] = [];
  const urlClass = options.url ? classifyExtractionUrl(options.url) : undefined;
  if (available.jina) order.push("jina");
  // Gov/static HTML: Firecrawl escalate-only. Default/paywalled, and any PDF (incl. gov PDFs
  // after local pdfjs miss), include Firecrawl after Jina so binary docs are not stuck on
  // jina→snippet_fallback.
  const includeFirecrawl = Boolean(options.escalateFirecrawl)
    || urlClass === "default"
    || urlClass === "paywalled"
    || Boolean(options.url && isPdfExtractionUrl(options.url));
  if (includeFirecrawl && available.firecrawl) order.push("firecrawl");
  if (available.scraperapi) order.push("scraperapi");
  if (available.zenrows) order.push("zenrows");
  if (available.scrapingbee) order.push("scrapingbee");
  if (available.geekflare) order.push("geekflare");
  order.push("snippet_fallback");
  return order;
}

export function searchModeForBucket(bucketId?: string): "web" | "news" | "academic" | "legal" | "official" | "semantic" {
  if (/court|legal/.test(bucketId ?? "")) return "legal";
  if (/government|parliament|electoral/.test(bucketId ?? "")) return "official";
  if (/academic|policy/.test(bucketId ?? "")) return "academic";
  if (/media|press/.test(bucketId ?? "")) return "news";
  return "web";
}
