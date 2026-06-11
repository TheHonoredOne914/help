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

const PROVIDER_NAME = "zenrows";
const DEFAULT_TIMEOUT_MS = 20000;

interface ZenrowsEnv {
  apiKey: string | null;
  enabled: boolean;
  timeoutMs: number;
  jsRender: boolean;
  premiumProxy: boolean;
  proxyCountry: string | null;
}

function readEnv(keys: SearchProviderKeys): ZenrowsEnv {
  const apiKey = (process.env.ZENROWS_API_KEY ?? (keys as Record<string, unknown>).zenrows ?? null) as string | null;
  const enabled = process.env.ZENROWS_ENABLED === "true";
  const timeoutRaw = process.env.ZENROWS_TIMEOUT_MS;
  const timeoutMs = timeoutRaw && Number.isFinite(Number(timeoutRaw)) ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;
  const jsRender = process.env.ZENROWS_JS_RENDER === "true";
  const premiumProxy = process.env.ZENROWS_PREMIUM_PROXY === "true";
  const rawCountry = process.env.ZENROWS_PROXY_COUNTRY?.trim();
  const proxyCountry = rawCountry ? rawCountry : null;
  return { apiKey, enabled, timeoutMs, jsRender, premiumProxy, proxyCountry };
}

function buildRequestUrl(targetUrl: string, env: ZenrowsEnv, key: string): string {
  const params = new URLSearchParams();
  params.set("apikey", key);
  params.set("url", targetUrl);
  if (env.jsRender) params.set("js_render", "true");
  if (env.premiumProxy) {
    params.set("premium_proxy", "true");
    if (env.proxyCountry) params.set("proxy_country", env.proxyCountry);
  }
  return `https://api.zenrows.com/v1/?${params.toString()}`;
}

export const zenrowsExtractorProvider: ExtractorProvider = {
  name: PROVIDER_NAME as ExtractorProviderName,
  configured(keys: SearchProviderKeys) {
    const env = readEnv(keys);
    return Boolean(env.apiKey && env.apiKey.trim()) && env.enabled;
  },
  async extract(url: string, keys: SearchProviderKeys, options: ExtractorOptions): Promise<ExtractedPageContent> {
    const env = readEnv(keys);
    const readiness = providerReady(PROVIDER_NAME, env.apiKey, env.enabled, "ZENROWS_ENABLED");
    if (!readiness.ready) {
      if (readiness.reason === "missing_key") throw missingKeyError(PROVIDER_NAME, "ZENROWS_API_KEY");
      throw providerDisabledError(PROVIDER_NAME, "ZENROWS_ENABLED");
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
          `Zenrows extraction unavailable: 504 ${body}`.trim(),
          504,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new SearchProviderError(
          PROVIDER_NAME,
          classifyAuthStatus(response.status),
          `Zenrows authentication failed: ${response.status} ${body}`.trim(),
          response.status,
        );
      }
      throw httpError(PROVIDER_NAME, response.status, body);
    }
    const rawText = await response.text();
    const text = rawText.trim();
    if (!text) {
      return emptyContentResult(url, PROVIDER_NAME, started, "zenrows", { reason: "empty_response" });
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
        method: "zenrows",
        jsRender: env.jsRender,
        premiumProxy: env.premiumProxy,
        proxyCountry: env.proxyCountry,
      },
    };
  },
  async healthCheck(keys: SearchProviderKeys, options: ExtractorOptions = {}): Promise<SearchProviderHealth> {
    const env = readEnv(keys);
    if (!env.apiKey || !env.apiKey.trim()) return notConfiguredHealth(PROVIDER_NAME, "missing_key");
    if (!env.enabled) return notConfiguredHealth(PROVIDER_NAME, "unavailable");
    const started = Date.now();
    try {
      const result = await zenrowsExtractorProvider.extract("https://example.com", keys, {
        ...options,
        timeoutMs: options.timeoutMs ?? 8000,
      });
      return healthFromExtract(PROVIDER_NAME, keys, started, result);
    } catch (error) {
      return healthFromExtract(PROVIDER_NAME, keys, started, { error });
    }
  },
};
