import { fetchWithTimeout, safeResponseText, statusFromHttp, SearchProviderError } from "../search-provider-errors.js";
import { normalizeSearchResults } from "../search-result-normalizer.js";
import type { SearchProvider, SearchProviderHealth, SearchProviderOptions } from "../search-provider-types.js";

export const exaSearchProvider: SearchProvider = {
  name: "exa",
  configured: (keys) => Boolean(keys.exa?.trim()),
  async search(query, keys, options) {
    const key = keys.exa?.trim();
    if (!key) throw new SearchProviderError("exa", "missing_key", "Exa API key is not configured");
    const response = await fetchWithTimeout(options.fetchFn ?? fetch, "https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        query: query.query,
        numResults: Math.min(query.maxResults ?? 10, 25),
        type: query.mode === "semantic" || query.mode === "academic" ? "neural" : "auto",
        includeDomains: query.domains,
        excludeDomains: query.excludeDomains,
        startPublishedDate: query.freshnessDays ? new Date(Date.now() - query.freshnessDays * 86400000).toISOString().slice(0, 10) : undefined,
      }),
      signal: options.abortSignal,
    }, options.timeoutMs ?? 12000);
    if (!response.ok) throw new SearchProviderError("exa", statusFromHttp(response.status), `Exa search failed: ${response.status} ${await safeResponseText(response)}`, response.status);
    return normalizeSearchResults("exa", await response.json(), { query: query.query, bucketId: query.bucketId });
  },
  async healthCheck(keys, options = {}): Promise<SearchProviderHealth> {
    const started = Date.now();
    if (!keys.exa?.trim()) return { provider: "exa", configured: false, healthy: false, status: "missing_key", canSearch: false, canExtract: false };
    try {
      await exaSearchProvider.search({ query: "India constitutional law", mode: "semantic", maxResults: 1 }, keys, options);
      return { provider: "exa", configured: true, healthy: true, status: "healthy", canSearch: true, canExtract: false, latencyMs: Date.now() - started };
    } catch (error) {
      const status = error instanceof SearchProviderError ? error.status : "unavailable";
      return { provider: "exa", configured: true, healthy: false, status, canSearch: false, canExtract: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
    }
  },
};
