import { fetchWithTimeout, safeResponseText, statusFromHttp, SearchProviderError } from "../search-provider-errors.js";
import { normalizeSearchResults } from "../search-result-normalizer.js";
import type { SearchProvider, SearchProviderHealth, SearchProviderKeys, SearchProviderOptions, SearchQuery } from "../search-provider-types.js";

export const serperSearchProvider: SearchProvider = {
  name: "serper",
  configured: (keys) => Boolean(keys.serper?.trim()),
  async search(query, keys, options) {
    const key = keys.serper?.trim();
    if (!key) throw new SearchProviderError("serper", "missing_key", "Serper API key is not configured");
    const endpoint = query.mode === "news" ? "https://google.serper.dev/news" : "https://google.serper.dev/search";
    const q = withDomainFilters(query.query, query.domains, query.excludeDomains);
    const response = await fetchWithTimeout(options.fetchFn ?? fetch, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q, num: Math.min(query.maxResults ?? 10, 20), gl: query.country ?? "in", hl: query.locale ?? "en" }),
      signal: options.abortSignal,
    }, options.timeoutMs ?? 12000);
    if (!response.ok) throw new SearchProviderError("serper", statusFromHttp(response.status), `Serper search failed: ${response.status} ${await safeResponseText(response)}`, response.status);
    return normalizeSearchResults("serper", await response.json(), { query: q, bucketId: query.bucketId });
  },
  async healthCheck(keys, options) {
    return healthCheck("serper", keys, options);
  },
};

async function healthCheck(provider: string, keys: SearchProviderKeys, options: SearchProviderOptions = {}): Promise<SearchProviderHealth> {
  const key = keys.serper?.trim();
  if (!key) return { provider: "serper", configured: false, healthy: false, status: "missing_key", canSearch: false, canExtract: false };
  const started = Date.now();
  try {
    await serperSearchProvider.search({ query: "site:pib.gov.in India", mode: "official", maxResults: 1 }, keys, options);
    return { provider: "serper", configured: true, healthy: true, status: "healthy", canSearch: true, canExtract: false, latencyMs: Date.now() - started };
  } catch (error) {
    const status = error instanceof SearchProviderError ? error.status : "unavailable";
    return { provider: "serper", configured: true, healthy: false, status, canSearch: false, canExtract: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
  }
}

function withDomainFilters(query: string, domains?: string[], excludeDomains?: string[]): string {
  const include = (domains ?? []).filter(Boolean).map((domain) => `site:${domain}`).join(" OR ");
  const exclude = (excludeDomains ?? []).filter(Boolean).map((domain) => `-site:${domain}`).join(" ");
  return [include ? `(${include})` : "", query, exclude].filter(Boolean).join(" ").trim();
}
