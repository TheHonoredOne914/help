import { fetchWithTimeout, safeResponseText, statusFromHttp, SearchProviderError } from "../search-provider-errors.js";
import { normalizeSearchResults } from "../search-result-normalizer.js";
import type { SearchProvider, SearchProviderHealth } from "../search-provider-types.js";

export const braveSearchProvider: SearchProvider = {
  name: "brave",
  configured: (keys) => Boolean(keys.brave?.trim()),
  async search(query, keys, options) {
    const key = keys.brave?.trim();
    if (!key) throw new SearchProviderError("brave", "missing_key", "Brave API key is not configured");
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query.query)}&count=${Math.min(query.maxResults ?? 10, 20)}`;
    const response = await fetchWithTimeout(options.fetchFn ?? fetch, url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: options.abortSignal }, options.timeoutMs ?? 12000);
    if (!response.ok) throw new SearchProviderError("brave", statusFromHttp(response.status), `Brave search failed: ${response.status} ${await safeResponseText(response)}`, response.status);
    return normalizeSearchResults("brave", await response.json(), { query: query.query, bucketId: query.bucketId });
  },
  async healthCheck(keys, options = {}): Promise<SearchProviderHealth> {
    const started = Date.now();
    if (!keys.brave?.trim()) return { provider: "brave", configured: false, healthy: false, status: "missing_key", canSearch: false, canExtract: false };
    try {
      await braveSearchProvider.search({ query: "India Parliament", mode: "web", maxResults: 1 }, keys, options);
      return { provider: "brave", configured: true, healthy: true, status: "healthy", canSearch: true, canExtract: false, latencyMs: Date.now() - started };
    } catch (error) {
      const status = error instanceof SearchProviderError ? error.status : "unavailable";
      return { provider: "brave", configured: true, healthy: false, status, canSearch: false, canExtract: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
    }
  },
};
