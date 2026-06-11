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
  retryAfterFromHeaders,
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

const PROVIDER_NAME = "scrapingbee";
const DEFAULT_TIMEOUT_MS = 20000;

interface ScrapingbeeEnv {
  apiKey: string | null;
  enabled: boolean;
  timeoutMs: number;
  renderJs: boolean;
  premiumProxy: boolean;
  countryCode: string | null;
}

function readEnv(keys: SearchProviderKeys): ScrapingbeeEnv {
  const apiKey = (process.env.SCRAPINGBEE_API_KEY ?? (keys as Record<string, unknown>).scrapingbee ?? null) as string | null;
  const enabled = process.env.SCRAPINGBEE_ENABLED === "true";
  const timeoutRaw = process.env.SCRAPINGBEE_TIMEOUT_MS;
  const timeoutMs = timeoutRaw && Number.isFinite(Number(timeoutRaw)) ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;
  const renderJs = process.env.SCRAPINGBEE_RENDER_JS === "true";
  const premiumProxy = process.env.SCRAPINGBEE_PREMIUM_PROXY === "true";
  const rawCountry = process.env.SCRAPINGBEE_COUNTRY_CODE?.trim();
  const countryCode = rawCountry ? rawCountry : null;
  return { apiKey, enabled, timeoutMs, renderJs, premiumProxy, countryCode };
}

function buildRequestUrl(targetUrl: string, env: ScrapingbeeEnv, key: string): string {
  const params = new URLSearchParams();
  params.set("api_key", key);
  params.set("url", targetUrl);
  if (env.renderJs) params.set("render_js", "true");
  if (env.premiumProxy) {
    params.set("premium_proxy", "true");
    if (env.countryCode) params.set("country_code", env.countryCode);
  }
  return `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
}

export const scrapingbeeExtractorProvider: ExtractorProvider = {
  name: PROVIDER_NAME as ExtractorProviderName,
  configured(keys: SearchProviderKeys) {
    const env = readEnv(keys);
    return Boolean(env.apiKey && env.apiKey.trim()) && env.enabled;
  },
  async extract(url: string, keys: SearchProviderKeys, options: ExtractorOptions): Promise<ExtractedPageContent> {
    const env = readEnv(keys);
    const readiness = providerReady(PROVIDER_NAME, env.apiKey, env.enabled, "SCRAPINGBEE_ENABLED");
    if (!readiness.ready) {
      if (readiness.reason === "missing_key") throw missingKeyError(PROVIDER_NAME, "SCRAPINGBEE_API_KEY");
      throw providerDisabledError(PROVIDER_NAME, "SCRAPINGBEE_ENABLED");
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
      if (response.status === 429) {
        const retryAfterMs = retryAfterFromHeaders(response.headers);
        const error = new SearchProviderError(
          PROVIDER_NAME,
          "rate_limited",
          `Scrapingbee rate limited: 429${retryAfterMs !== undefined ? ` (retry-after ${retryAfterMs}ms)` : ""} ${body}`.trim(),
          429,
        );
        if (retryAfterMs !== undefined) {
          (error as unknown as { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
        }
        throw error;
      }
      if (response.status === 401 || response.status === 403) {
        throw new SearchProviderError(
          PROVIDER_NAME,
          classifyAuthStatus(response.status),
          `Scrapingbee authentication failed: ${response.status} ${body}`.trim(),
          response.status,
        );
      }
      throw httpError(PROVIDER_NAME, response.status, body);
    }
    const rawText = await response.text();
    const text = rawText.trim();
    if (!text) {
      return emptyContentResult(url, PROVIDER_NAME, started, "scrapingbee", { reason: "empty_response" });
    }
    return {
      url,
      provider: PROVIDER_NAME as ExtractionProviderName,
      text,
      markdown: text,
      excerpt: text,
      status: "success",
      latencyMs: Date.now() - started,
      metadata: {
        extractor: PROVIDER_NAME,
        method: "scrapingbee",
        renderJs: env.renderJs,
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
      const result = await scrapingbeeExtractorProvider.extract("https://example.com", keys, {
        ...options,
        timeoutMs: options.timeoutMs ?? 8000,
      });
      return healthFromExtract(PROVIDER_NAME, keys, started, result);
    } catch (error) {
      return healthFromExtract(PROVIDER_NAME, keys, started, { error });
    }
  },
};
