import { fetchWithTimeout, safeResponseText, statusFromHttp, SearchProviderError } from "../search-provider-errors.js";
import { normalizeSearchResults } from "../search-result-normalizer.js";
import type { SearchProvider, SearchProviderHealth } from "../search-provider-types.js";

export const tavilySearchProvider: SearchProvider = {
  name: "tavily",
  configured: (keys) => Boolean(keys.tavily?.trim()),
  async search(query, keys, options) {
    const key = keys.tavily?.trim();
    if (!key) throw new SearchProviderError("tavily", "missing_key", "Tavily API key is not configured");
    const response = await fetchWithTimeout(options.fetchFn ?? fetch, "https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: query.query, search_depth: query.mode === "web" ? "basic" : "advanced", max_results: query.maxResults ?? 10, include_answer: false }),
      signal: options.abortSignal,
    }, options.timeoutMs ?? 12000);
    if (!response.ok) throw new SearchProviderError("tavily", statusFromHttp(response.status), `Tavily search failed: ${response.status} ${await safeResponseText(response)}`, response.status);
    return normalizeSearchResults("tavily", await response.json(), { query: query.query, bucketId: query.bucketId });
  },
  async healthCheck(keys, options = {}): Promise<SearchProviderHealth> {
    const started = Date.now();
    if (!keys.tavily?.trim()) return { provider: "tavily", configured: false, healthy: false, status: "missing_key", canSearch: false, canExtract: false };
    try {
      await tavilySearchProvider.search({ query: "India Parliament", mode: "web", maxResults: 1 }, keys, options);
      return { provider: "tavily", configured: true, healthy: true, status: "healthy", canSearch: true, canExtract: false, latencyMs: Date.now() - started };
    } catch (error) {
      const status = error instanceof SearchProviderError ? error.status : "unavailable";
      return { provider: "tavily", configured: true, healthy: false, status, canSearch: false, canExtract: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
    }
  },
};
