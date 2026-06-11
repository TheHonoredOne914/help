import { SearchProviderError, statusFromHttp } from "../search-provider-errors.js";
import { assertSafeSourceFetchUrl } from "../../security/source-url-policy.js";
import type {
  ExtractedPageContent,
  ExtractorOptions,
  ExtractionProviderName,
  SearchProviderHealth,
  SearchProviderName,
  SearchProviderStatusValue,
} from "../search-provider-types.js";

export function missingKeyError(providerName: string, envVarName: string): SearchProviderError {
  return new SearchProviderError(
    providerName,
    "missing_key",
    `${providerName} API key is not configured (set ${envVarName})`,
  );
}

export function providerDisabledError(providerName: string, envVarName: string): SearchProviderError {
  return new SearchProviderError(
    providerName,
    "unavailable",
    `${providerName} provider is disabled (set ${envVarName}=true to enable)`,
  );
}

export function httpError(providerName: string, status: number, bodyPreview: string): SearchProviderError {
  const trimmed = (bodyPreview ?? "").trim();
  const suffix = trimmed ? ` ${trimmed}` : "";
  return new SearchProviderError(
    providerName,
    statusFromHttp(status),
    `${providerName} extraction failed: ${status}${suffix}`,
    status,
  );
}

export function providerReady(
  providerName: string,
  apiKey: string | null | undefined,
  enabled: boolean | undefined,
  envVarName: string,
): { ready: true; key: string } | { ready: false; reason: "missing_key" | "disabled" } {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) return { ready: false, reason: "missing_key" };
  if (enabled !== true) return { ready: false, reason: "disabled" };
  void envVarName;
  return { ready: true, key };
}

export async function safeTargetUrl(url: string, options: ExtractorOptions): Promise<URL> {
  return assertSafeSourceFetchUrl(url, { resolveDns: (options.fetchFn ?? fetch) === fetch });
}

export function emptyContentResult(
  url: string,
  providerName: string,
  started: number,
  method: string,
  options?: { reason?: string },
): ExtractedPageContent {
  return {
    url,
    provider: providerName as ExtractionProviderName,
    status: "partial",
    latencyMs: Date.now() - started,
    metadata: {
      extractor: providerName,
      emptyContent: true,
      method,
      reason: options?.reason,
    },
  };
}

export function notConfiguredHealth(
  providerName: string,
  status: SearchProviderStatusValue = "missing_key",
): SearchProviderHealth {
  return {
    provider: providerName as SearchProviderName,
    configured: false,
    healthy: false,
    status,
    canSearch: false,
    canExtract: false,
  };
}

export function healthFromExtract(
  providerName: string,
  keys: unknown,
  started: number,
  result: ExtractedPageContent | { error: unknown },
): SearchProviderHealth {
  void keys;
  const latencyMs = Date.now() - started;
  if ("error" in result) {
    const error = result.error;
    const status: SearchProviderStatusValue =
      error instanceof SearchProviderError ? error.status : "unavailable";
    return {
      provider: providerName as SearchProviderName,
      configured: true,
      healthy: false,
      status,
      canSearch: false,
      canExtract: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs,
    };
  }
  return {
    provider: providerName as SearchProviderName,
    configured: true,
    healthy: result.status !== "failed",
    status: "healthy",
    canSearch: false,
    canExtract: true,
    latencyMs,
  };
}

export function classifyAuthStatus(status: number): SearchProviderStatusValue {
  if (status === 401 || status === 403) return "invalid_key";
  return statusFromHttp(status);
}

export function retryAfterFromHeaders(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}
