export const SUPPORTED_PROVIDER_PREFIXES = [
  "groq",
  "ollama",
  "nvidia",
  "gemini",
  "openrouter",
  "github",
  "cerebras",
  "openai",
] as const;

export type SupportedProviderPrefix = typeof SUPPORTED_PROVIDER_PREFIXES[number];

export class ProviderRouterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "ProviderRouterError";
  }
}

export function parseProviderModelId(prefixedModelId: string): {
  prefix: SupportedProviderPrefix;
  modelId: string;
} {
  const rawModelId = String(prefixedModelId ?? "").trim();
  const slashIdx = rawModelId.indexOf("/");

  if (!rawModelId || slashIdx <= 0 || slashIdx === rawModelId.length - 1) {
    throw invalidModelId(prefixedModelId);
  }

  const prefix = rawModelId.slice(0, slashIdx) as SupportedProviderPrefix;
  const modelId = rawModelId.slice(slashIdx + 1).trim();

  if (!SUPPORTED_PROVIDER_PREFIXES.includes(prefix)) {
    throw new ProviderRouterError(
      "unsupported_provider_prefix",
      `[provider-router] Unknown provider prefix: "${prefix}". Supported: ${SUPPORTED_PROVIDER_PREFIXES.join(", ")}.`,
    );
  }

  if (!modelId) throw invalidModelId(prefixedModelId);
  return { prefix, modelId };
}

export function stripProviderPrefix(prefixedModelId: string): string {
  return parseProviderModelId(prefixedModelId).modelId;
}

function invalidModelId(prefixedModelId: string): ProviderRouterError {
  return new ProviderRouterError(
    "invalid_model_id",
    `[provider-router] Invalid model ID: "${prefixedModelId}". Must be formatted as "provider/model-name" ` +
      `(e.g. "groq/llama-3.3-70b-versatile", "gemini/gemini-2.5-flash").`,
  );
}
