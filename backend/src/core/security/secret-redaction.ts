import { logger } from "../../lib/logger.js";

const SECRET_PATTERNS: RegExp[] = [
  /\bgsk_[A-Za-z0-9_-]{4,}\b/g,
  /\bsk-[A-Za-z0-9_-]{4,}\b/g,
  /\bsk-or-v1-[A-Za-z0-9_-]{4,}\b/g,
  /\btvly-[A-Za-z0-9_-]{6,}\b/g,
  /\bjina_[A-Za-z0-9_-]{6,}\b/g,
  /\bAIza[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b(authorization|x-api-key|api-key)\s*[:=]\s*["']?[^"',\s}]+/gi,
  /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|KEY))\s*=\s*["']?[^"',\s}]+/g,
];

export function redactSecretString(input: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, (match) => {
    const keyName = match.match(/^(authorization|x-api-key|api-key)/i)?.[1];
    return keyName ? `${keyName}: [REDACTED_SECRET]` : "[REDACTED_SECRET]";
  }), input);
}

export function redactSecretsDeep<T>(value: T): T {
  if (typeof value === "string") return redactSecretString(value) as T;
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSecretsDeep(item)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/authorization|x-api-key|api-key|token|secret|key/i.test(key)) {
      out[key] = typeof item === "string" ? "[REDACTED_SECRET]" : redactSecretsDeep(item);
    } else {
      out[key] = redactSecretsDeep(item);
    }
  }
  return out as T;
}

export function safeLog(eventName: string, payload: unknown): void {
  logger.info({ eventName, payload: redactSecretsDeep(payload) }, "[safe-log]");
}
