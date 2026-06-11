import { fetchWithTimeout, redactKnownSecretValues, safeResponseText, statusFromHttp, SearchProviderError } from "../search-provider-errors.js";
import { assertSafeSourceFetchUrl, buildJinaReaderUrl } from "../../security/source-url-policy.js";
import type { ExtractorProvider, SearchProviderHealth } from "../search-provider-types.js";

export const jinaExtractorProvider: ExtractorProvider = {
  name: "jina",
  configured: (keys) => Boolean(keys.jina?.trim()),
  async extract(url, keys, options) {
    const key = keys.jina?.trim();
    if (!key) throw new SearchProviderError("jina", "missing_key", "Jina API key is not configured");
    const started = Date.now();
    const safeUrl = await assertSafeSourceFetchUrl(url, { resolveDns: (options.fetchFn ?? fetch) === fetch });
    const jinaUrl = buildJinaReaderUrl(safeUrl);
    const response = await fetchWithTimeout(options.fetchFn ?? fetch, jinaUrl, { headers: { Authorization: `Bearer ${key}` }, signal: options.abortSignal }, options.timeoutMs ?? 15000);
    if (!response.ok) {
      const body = redactKnownSecretValues(await safeResponseText(response), [key]);
      throw new SearchProviderError("jina", statusFromHttp(response.status), `Jina reader failed: ${response.status} ${body}`, response.status);
    }
    const text = (await response.text()).trim();
    return {
      url,
      provider: "jina",
      text,
      markdown: text,
      excerpt: text,
      status: text ? "success" : "partial",
      latencyMs: Date.now() - started,
      metadata: { extractor: "jina" },
    };
  },
  async healthCheck(keys, options = {}): Promise<SearchProviderHealth> {
    if (!keys.jina?.trim()) return { provider: "jina", configured: false, healthy: false, status: "missing_key", canSearch: false, canExtract: false };
    const started = Date.now();
    try {
      const result = await jinaExtractorProvider.extract("https://example.com", keys, { ...options, timeoutMs: options.timeoutMs ?? 8000 });
      return { provider: "jina", configured: true, healthy: result.status !== "failed", status: "healthy", canSearch: false, canExtract: true, latencyMs: Date.now() - started };
    } catch (error) {
      const status = error instanceof SearchProviderError ? error.status : "unavailable";
      return { provider: "jina", configured: true, healthy: false, status, canSearch: false, canExtract: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
    }
  },
};
