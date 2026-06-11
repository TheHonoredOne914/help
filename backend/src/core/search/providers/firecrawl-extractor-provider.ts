import { fetchWithTimeout, redactKnownSecretValues, safeResponseText, statusFromHttp, SearchProviderError } from "../search-provider-errors.js";
import { assertSafeSourceFetchUrl } from "../../security/source-url-policy.js";
import type { ExtractedPageContent, ExtractorProvider, SearchProviderHealth } from "../search-provider-types.js";

export const firecrawlExtractorProvider: ExtractorProvider = {
  name: "firecrawl",
  configured: (keys) => Boolean(keys.firecrawl?.trim()),
  async extract(url, keys, options) {
    const key = keys.firecrawl?.trim();
    if (!key) throw new SearchProviderError("firecrawl", "missing_key", "Firecrawl API key is not configured");
    const started = Date.now();
    const safeUrl = await assertSafeSourceFetchUrl(url, { resolveDns: (options.fetchFn ?? fetch) === fetch });
    const response = await fetchWithTimeout(options.fetchFn ?? fetch, "https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url: safeUrl.href, formats: ["markdown"] }),
      signal: options.abortSignal,
    }, options.timeoutMs ?? 15000);
    if (!response.ok) {
      const body = redactKnownSecretValues(await safeResponseText(response), [key]);
      throw new SearchProviderError("firecrawl", statusFromHttp(response.status), `Firecrawl extraction failed: ${response.status} ${body}`, response.status);
    }
    const payload = await response.json() as any;
    const data = payload.data ?? payload;
    return {
      url,
      provider: "firecrawl",
      title: data.title ?? data.metadata?.title,
      markdown: data.markdown,
      text: data.text ?? data.markdown,
      excerpt: data.markdown ?? data.text,
      status: data.markdown || data.text || data.html ? "success" : "partial",
      latencyMs: Date.now() - started,
      metadata: { extractor: "firecrawl" },
    };
  },
  async healthCheck(keys, options = {}): Promise<SearchProviderHealth> {
    if (!keys.firecrawl?.trim()) return { provider: "firecrawl", configured: false, healthy: false, status: "missing_key", canSearch: false, canExtract: false };
    const started = Date.now();
    try {
      const result = await firecrawlExtractorProvider.extract("https://example.com", keys, { ...options, timeoutMs: options.timeoutMs ?? 8000 });
      return { provider: "firecrawl", configured: true, healthy: result.status !== "failed", status: "healthy", canSearch: false, canExtract: true, latencyMs: Date.now() - started };
    } catch (error) {
      const status = error instanceof SearchProviderError ? error.status : "unavailable";
      return { provider: "firecrawl", configured: true, healthy: false, status, canSearch: false, canExtract: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
    }
  },
};
