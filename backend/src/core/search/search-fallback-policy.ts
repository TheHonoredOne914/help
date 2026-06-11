import type { ExtractorProviderAvailability, ExtractionProviderName, SearchOnlyProviderName, SearchPolicyMode, SearchProviderAvailability } from "./search-provider-types.js";

export function getSearchProviderOrder(mode: SearchPolicyMode, available: SearchProviderAvailability): SearchOnlyProviderName[] {
  const base: SearchOnlyProviderName[] = mode === "fast_research" || mode === "web_search"
    ? ["serper", "exa", "tavily", "brave"]
    : ["serper", "exa", "tavily", "brave"];
  return base.filter((provider) => available[provider]);
}

export function getExtractionProviderOrder(available: ExtractorProviderAvailability): ExtractionProviderName[] {
  const order: ExtractionProviderName[] = [];
  if (available.jina) order.push("jina");
  if (available.scraperapi) order.push("scraperapi");
  if (available.firecrawl) order.push("firecrawl");
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
