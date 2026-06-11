import {
  fetchWithTimeout,
  redactKnownSecretValues,
  safeResponseText,
  SearchProviderError,
} from "../search-provider-errors.js";
import {
  classifyAuthStatus,
  emptyContentResult,
  healthFromExtract,
  httpError,
  missingKeyError,
  notConfiguredHealth,
  providerDisabledError,
  providerReady,
  safeTargetUrl,
} from "./provider-utils.js";
import type {
  ExtractedPageContent,
  ExtractionProviderName,
  ExtractorOptions,
  ExtractorProvider,
  ExtractorProviderName,
  SearchProviderHealth,
  SearchProviderKeys,
} from "../search-provider-types.js";

const PROVIDER_NAME = "scraperapi";
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_SCRAPERAPI_HTML_BYTES = Number(process.env.SCRAPERAPI_MAX_HTML_BYTES ?? 5 * 1024 * 1024);

interface ScraperapiEnv {
  apiKey: string | null;
  enabled: boolean;
  timeoutMs: number;
  render: boolean;
  premiumProxy: boolean;
  countryCode: string | null;
}

function readEnv(keys: SearchProviderKeys): ScraperapiEnv {
  const apiKey = (process.env.SCRAPERAPI_KEY ?? (keys as Record<string, unknown>).scraperapi ?? null) as string | null;
  // ScraperAPI is opt-in. Missing enabled env means disabled.
  const enabled = process.env.SCRAPERAPI_ENABLED === "true";
  const timeoutRaw = process.env.SCRAPERAPI_TIMEOUT_MS;
  const timeoutMs = timeoutRaw && Number.isFinite(Number(timeoutRaw)) ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;
  const render = process.env.SCRAPERAPI_RENDER !== "false";
  const premiumProxy = process.env.SCRAPERAPI_PREMIUM_PROXY === "true";
  const rawCountry = process.env.SCRAPERAPI_COUNTRY_CODE?.trim();
  const countryCode = rawCountry ? rawCountry : null;
  return { apiKey, enabled, timeoutMs, render, premiumProxy, countryCode };
}

function buildRequestUrl(targetUrl: string, env: ScraperapiEnv, key: string): string {
  const params = new URLSearchParams();
  params.set("api_key", key);
  params.set("url", targetUrl);
  // ScraperAPI renders JS by default. Only add the flag when explicitly
  // disabled.
  if (!env.render) params.set("render", "false");
  if (env.premiumProxy) {
    params.set("premium_proxy", "true");
    if (env.countryCode) params.set("country_code", env.countryCode);
  }
  return `https://api.scraperapi.com/?${params.toString()}`;
}

export const scraperapiExtractorProvider: ExtractorProvider = {
  name: PROVIDER_NAME as ExtractorProviderName,
  configured(keys: SearchProviderKeys) {
    const env = readEnv(keys);
    return Boolean(env.apiKey && env.apiKey.trim()) && env.enabled;
  },
  async extract(url: string, keys: SearchProviderKeys, options: ExtractorOptions): Promise<ExtractedPageContent> {
    const env = readEnv(keys);
    const readiness = providerReady(PROVIDER_NAME, env.apiKey, env.enabled, "SCRAPERAPI_ENABLED");
    if (!readiness.ready) {
      if (readiness.reason === "missing_key") throw missingKeyError(PROVIDER_NAME, "SCRAPERAPI_KEY");
      throw providerDisabledError(PROVIDER_NAME, "SCRAPERAPI_ENABLED");
    }
    const key = readiness.key;
    const started = Date.now();
    const safeUrl = await safeTargetUrl(url, options);
    const requestUrl = buildRequestUrl(safeUrl.href, env, key);
    const response = await fetchWithTimeout(
      options.fetchFn ?? fetch,
      requestUrl,
      { method: "GET", signal: options.abortSignal },
      options.timeoutMs ?? env.timeoutMs,
    );
    if (!response.ok) {
      const rawBody = await safeResponseText(response);
      const body = redactKnownSecretValues(rawBody, [key]);
      if (response.status === 504) {
        throw new SearchProviderError(
          PROVIDER_NAME,
          "unavailable",
          `ScraperAPI extraction unavailable: 504 ${body}`.trim(),
          504,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new SearchProviderError(
          PROVIDER_NAME,
          classifyAuthStatus(response.status),
          `ScraperAPI authentication failed: ${response.status} ${body}`.trim(),
          response.status,
        );
      }
      throw httpError(PROVIDER_NAME, response.status, body);
    }
    // ScraperAPI returns raw HTML; cap the read so a hostile server
    // can't blow up the process.
    const html = (await response.text()).slice(0, MAX_SCRAPERAPI_HTML_BYTES);
    if (!html.trim()) {
      return emptyContentResult(url, PROVIDER_NAME, started, "scraperapi", { reason: "empty_response" });
    }
    return {
      url,
      provider: PROVIDER_NAME as ExtractionProviderName,
      html,
      status: "success",
      latencyMs: Date.now() - started,
      metadata: {
        extractor: PROVIDER_NAME,
        method: "scraperapi",
        render: env.render,
        premiumProxy: env.premiumProxy,
        countryCode: env.countryCode,
      },
    };
  },
  async healthCheck(keys: SearchProviderKeys, options: ExtractorOptions = {}): Promise<SearchProviderHealth> {
    const env = readEnv(keys);
    if (!env.apiKey || !env.apiKey.trim()) return notConfiguredHealth(PROVIDER_NAME, "missing_key");
    if (!env.enabled) return notConfiguredHealth(PROVIDER_NAME, "unavailable");
    const started = Date.now();
    try {
      const result = await scraperapiExtractorProvider.extract("https://example.com", keys, {
        ...options,
        timeoutMs: options.timeoutMs ?? 8000,
      });
      return healthFromExtract(PROVIDER_NAME, keys, started, result);
    } catch (error) {
      return healthFromExtract(PROVIDER_NAME, keys, started, { error });
    }
  },
};
