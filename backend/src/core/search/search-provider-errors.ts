import { redactSecretString } from "../security/secret-redaction.js";
import type { SearchProviderStatusValue } from "./search-provider-types.js";

export class SearchProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: SearchProviderStatusValue,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(redactSecretString(message));
    this.name = "SearchProviderError";
  }
}

export function classifyProviderError(error: unknown): SearchProviderStatusValue {
  if (error instanceof SearchProviderError) return error.status;
  const name = error instanceof Error ? error.name : "";
  const text = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  // Distinguish budget/parent-triggered abort from real per-call timeout
  // "budget exceeded" indicates enrichment budget abort, not a per-call timeout
  if (/budget exceeded/.test(text)) return "aborted";
  if (name === "AbortError" || /abort|timeout|timed out/.test(text)) return "timeout";
  if (/401|403|unauthorized|forbidden|invalid[_ -]?key/.test(text)) return "invalid_key";
  if (/402|429|432|rate|quota|credit|usage limit|plan's set usage limit/.test(text)) return "rate_limited";
  if (/network|fetch failed|enotfound|econn|5\d\d/.test(text)) return "network_error";
  return "unavailable";
}

export function safeProviderError(error: unknown, fallback = "Provider request failed"): string {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return redactSecretString(message || fallback);
}

export function redactKnownSecretValues(input: string, secrets: Array<string | null | undefined>): string {
  const base = redactSecretString(input);
  return secrets.reduce((text: string, secret: string | null | undefined) => {
    const value = secret?.trim();
    return value ? text.split(value).join("[REDACTED_SECRET]") : text;
  }, base);
}

export function statusFromHttp(status: number): SearchProviderStatusValue {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 402 || status === 429 || status === 432) return "rate_limited";
  if (status >= 500) return "network_error";
  return "unavailable";
}

export async function safeResponseText(response: Response): Promise<string> {
  try {
    return redactSecretString((await response.text()).slice(0, 800));
  } catch {
    return "";
  }
}

export async function fetchWithTimeout(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    externalSignal?.removeEventListener("abort", abortFromExternal);
    clearTimeout(timeout);
  }
}
