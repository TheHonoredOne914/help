import { redactSecretsDeep } from "../security/secret-redaction.js";

export type ProviderErrorCode =
  | "rate_limited"
  | "request_too_large"
  | "invalid_key"
  | "invalid_model"
  | "billing_credits"
  | "timeout"
  | "network_error"
  | "provider_unavailable"
  | "catalog_fallback_only"
  | "config_error"
  | "unknown";

export interface ProviderFailureReport {
  provider: string;
  model?: string;
  stage?: "core_generation" | "source_usage";
  code: ProviderErrorCode;
  status?: number;
  retryable: boolean;
  fallbackAttempted?: boolean;
  safeMessage: string;
  retryAfterMs?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly safeDetails?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function safeProviderError(provider: string, error: unknown): ProviderError {
  const report = safeProviderErrorReport(provider, error);
  return new ProviderError(report.safeMessage, provider, { ...report, original: redactSecretsDeep(error) });
}

export function classifyProviderError(provider: string, error: unknown): ProviderFailureReport {
  return safeProviderErrorReport(provider, error);
}

export function safeProviderErrorReport(provider: string, error: unknown, extra: Partial<ProviderFailureReport> = {}): ProviderFailureReport {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const details = (error as any)?.safeDetails ?? (error as any);
  const status = Number(details?.status ?? details?.statusCode ?? (error as any)?.status ?? statusFromText(rawMessage)) || undefined;
  const retryAfterMs = Number(details?.retryAfterMs ?? parseRetryAfterMs(rawMessage)) || undefined;
  const code = codeFromStatusAndMessage(status, rawMessage);
  return {
    provider,
    code,
    status,
    retryable: code === "timeout" || code === "network_error" || code === "provider_unavailable",
    safeMessage: safeMessageFor(provider, code, retryAfterMs, rawMessage, status),
    retryAfterMs,
    ...extra,
  };
}

function codeFromStatusAndMessage(status: number | undefined, message: string): ProviderErrorCode {
  const text = message.toLowerCase();
  if (status === 206 || /catalog fallback|catalog_fallback/.test(text)) return "catalog_fallback_only";
  if (status === 402 || /402|insufficient credits|billing credits|credit balance|payment required/.test(text)) return "billing_credits";
  if (status === 404 || /404|model.*not found|no endpoints found|not found for model|unknown model/.test(text)) return "invalid_model";
  if (/timeout|timed out/.test(text)) return "timeout";
  if (status === 429 || /429|rate limit|too many requests/.test(text)) return "rate_limited";
  if (status === 413 || /413|request too large|requested \d+|tpm|token.*limit/.test(text)) return "request_too_large";
  if (status === 401 || status === 403 || /401|403|invalid key|unauthorized|forbidden/.test(text)) return "invalid_key";
  if (status && status >= 500) return "provider_unavailable";
  if (/network|terminated|econn|fetch failed/.test(text)) return "network_error";
  return "unknown";
}

function statusFromText(message: string): number | undefined {
  const match = message.match(/\b(206|401|402|403|404|413|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : undefined;
}

function parseRetryAfterMs(message: string): number | undefined {
  const match = message.match(/retry(?:\s|-)?after[^\d]*(\d+)/i);
  return match ? Number(match[1]) * 1000 : undefined;
}

function safeMessageFor(provider: string, code: ProviderErrorCode, retryAfterMs?: number, rawMessage = "", status?: number): string {
  const label = providerLabel(provider);
  const original = sanitizedOriginal(rawMessage);
  if (code === "rate_limited") {
    const retry = retryAfterMs ? ` Retry after ~${Math.ceil(retryAfterMs / 1000)}s.` : "";
    return `${label} rate limit reached.${retry}`;
  }
  if (code === "request_too_large") return `${label} request too large for this model or tier. Prompt compression or fallback required.`;
  if (code === "billing_credits") return `${label} billing credits or payment limit blocked this request${status ? ` (${status})` : ""}.${original ? ` ${original}` : ""}`;
  if (code === "catalog_fallback_only") return `${label} only has catalog/model-list fallback available; chat generation is not verified.`;
  if (code === "invalid_model") return `${label} model is unavailable for this run${status ? ` (${status})` : ""}.${original ? ` ${original}` : ""}`;
  if (code === "timeout") return `${label} timed out.${original ? ` ${original}` : ""}`;
  if (code === "invalid_key") return `${label} key is invalid or unauthorized${status ? ` (${status})` : ""}.${original ? ` ${original}` : ""}`;
  if (code === "provider_unavailable") return `${label} provider is unavailable${status ? ` (${status})` : ""}.${original ? ` ${original}` : ""}`;
  if (code === "network_error") return `${label} network or provider endpoint error.${original ? ` ${original}` : ""}`;
  return `${label} provider error.${original ? ` ${original}` : ""}`;
}

function providerLabel(provider: string): string {
  if (provider === "groq") return "Groq";
  if (provider === "github") return "GitHub Models";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "nvidia") return "NVIDIA";
  if (provider === "gemini") return "Gemini";
  return provider;
}

function sanitizedOriginal(message: string): string {
  const redacted = String(redactSecretsDeep(message))
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/\borg_[A-Za-z0-9_-]+/g, "[REDACTED_ORG]")
    .replace(/\bbilling\b/gi, "[REDACTED_BILLING]");
  const withoutRawJson = redacted.replace(/\{[\s\S]*\}/g, "[REDACTED_PROVIDER_BODY]");
  return withoutRawJson.length > 180 ? `${withoutRawJson.slice(0, 177)}...` : withoutRawJson;
}
