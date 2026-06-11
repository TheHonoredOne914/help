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

const PROVIDER_NAME = "geekflare";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_ENDPOINT = "https://scrape.api.geekflare.com/__UNCONFIRMED__/v1/extract";
const ALLOWED_OUTPUT_FORMATS = new Set(["markdown", "html", "text"]);

type GeekflareOutputFormat = "markdown" | "html" | "text";

interface GeekflareEnv {
  apiKey: string | null;
  enabled: boolean;
  endpointVerified: boolean;
  timeoutMs: number;
  renderJs: boolean;
  outputFormat: GeekflareOutputFormat;
  endpoint: string;
}

function readEnv(keys: SearchProviderKeys): GeekflareEnv {
  const apiKey = (process.env.GEEKFLARE_API_KEY ?? (keys as Record<string, unknown>).geekflare ?? null) as string | null;
  const enabled = process.env.GEEKFLARE_ENABLED === "true";
  const endpointVerified = process.env.GEEKFLARE_ENDPOINT_VERIFIED === "true";
  const timeoutRaw = process.env.GEEKFLARE_TIMEOUT_MS;
  const timeoutMs = timeoutRaw && Number.isFinite(Number(timeoutRaw)) ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;
  const renderJs = process.env.GEEKFLARE_RENDER_JS === "true";
  const requestedFormat = process.env.GEEKFLARE_OUTPUT_FORMAT?.trim().toLowerCase();
  const outputFormat: GeekflareOutputFormat =
    requestedFormat && ALLOWED_OUTPUT_FORMATS.has(requestedFormat)
      ? (requestedFormat as GeekflareOutputFormat)
      : "markdown";
  const endpoint = process.env.GEEKFLARE_ENDPOINT ?? DEFAULT_ENDPOINT;
  return { apiKey, enabled, endpointVerified, timeoutMs, renderJs, outputFormat, endpoint };
}

function buildRequestUrl(targetUrl: string, env: GeekflareEnv): string {
  const base = env.endpoint;
  const params = new URLSearchParams();
  params.set("url", targetUrl);
  params.set("output", env.outputFormat);
  if (env.renderJs) params.set("render_js", "true");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${params.toString()}`;
}

function pickTextFromPayload(payload: unknown, format: GeekflareOutputFormat): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const obj = payload as Record<string, unknown>;
  const data = (obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : obj);
  const preferredKey = format;
  const candidateKeys = [preferredKey, "markdown", "text", "html", "content", "body"];
  for (const key of candidateKeys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export const geekflareExtractorProvider: ExtractorProvider = {
  name: PROVIDER_NAME as ExtractorProviderName,
  configured(keys: SearchProviderKeys) {
    const env = readEnv(keys);
    return Boolean(env.apiKey && env.apiKey.trim()) && env.enabled && env.endpointVerified;
  },
  async extract(url: string, keys: SearchProviderKeys, options: ExtractorOptions): Promise<ExtractedPageContent> {
    const env = readEnv(keys);
    if (env.endpointVerified !== true) {
      throw new SearchProviderError(
        PROVIDER_NAME,
        "unavailable",
        "Geekflare provider endpoint is not verified. Set GEEKFLARE_ENDPOINT_VERIFIED=true only after confirming the endpoint and parameters against official Geekflare API documentation.",
      );
    }
    const readiness = providerReady(PROVIDER_NAME, env.apiKey, env.enabled, "GEEKFLARE_ENABLED");
    if (!readiness.ready) {
      if (readiness.reason === "missing_key") throw missingKeyError(PROVIDER_NAME, "GEEKFLARE_API_KEY");
      throw providerDisabledError(PROVIDER_NAME, "GEEKFLARE_ENABLED");
    }
    const key = readiness.key;
    const started = Date.now();
    const safeUrl = await safeTargetUrl(url, options);
    const requestUrl = buildRequestUrl(safeUrl.href, env);
    const response = await fetchWithTimeout(
      options.fetchFn ?? fetch,
      requestUrl,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json, text/plain;q=0.9" },
        signal: options.abortSignal,
      },
      options.timeoutMs ?? env.timeoutMs,
    );
    if (!response.ok) {
      const rawBody = await safeResponseText(response);
      const body = redactKnownSecretValues(rawBody, [key]);
      if (response.status === 401 || response.status === 403) {
        throw new SearchProviderError(
          PROVIDER_NAME,
          classifyAuthStatus(response.status),
          `Geekflare authentication failed: ${response.status} ${body}`.trim(),
          response.status,
        );
      }
      throw httpError(PROVIDER_NAME, response.status, body);
    }
    const contentType = response.headers.get("content-type") ?? "";
    let text = "";
    if (contentType.includes("application/json")) {
      try {
        const payload = (await response.json()) as unknown;
        text = pickTextFromPayload(payload, env.outputFormat).trim();
      } catch {
        text = "";
      }
    } else {
      text = (await response.text()).trim();
    }
    if (!text) {
      return emptyContentResult(url, PROVIDER_NAME, started, "geekflare", { reason: "empty_response" });
    }
    const isMarkdown = env.outputFormat === "markdown";
    const isHtml = env.outputFormat === "html";
    return {
      url,
      provider: PROVIDER_NAME as ExtractionProviderName,
      text,
      markdown: isMarkdown ? text : undefined,
      html: isHtml ? text : undefined,
      excerpt: text,
      status: "success",
      latencyMs: Date.now() - started,
      metadata: {
        extractor: PROVIDER_NAME,
        method: "geekflare",
        outputFormat: env.outputFormat,
        renderJs: env.renderJs,
        endpointVerified: env.endpointVerified,
      },
    };
  },
  async healthCheck(keys: SearchProviderKeys, options: ExtractorOptions = {}): Promise<SearchProviderHealth> {
    const env = readEnv(keys);
    if (!env.apiKey || !env.apiKey.trim()) return notConfiguredHealth(PROVIDER_NAME, "missing_key");
    if (!env.enabled) return notConfiguredHealth(PROVIDER_NAME, "unavailable");
    if (!env.endpointVerified) return notConfiguredHealth(PROVIDER_NAME, "unavailable");
    const started = Date.now();
    try {
      const result = await geekflareExtractorProvider.extract("https://example.com", keys, {
        ...options,
        timeoutMs: options.timeoutMs ?? 8000,
      });
      return healthFromExtract(PROVIDER_NAME, keys, started, result);
    } catch (error) {
      return healthFromExtract(PROVIDER_NAME, keys, started, { error });
    }
  },
};
