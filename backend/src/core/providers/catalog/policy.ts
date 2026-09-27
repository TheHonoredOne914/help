import type { OpenRouterPricingHint } from "./types.js";

export const GROQ_LIVE_FALLBACK_NATIVE = "openai/gpt-oss-120b";
export const DEFAULT_GROQ_MODEL = `groq/${GROQ_LIVE_FALLBACK_NATIVE}`;

export const OPENCODE_ZEN_FREE_MODELS = [
  "big-pickle",
  "nemotron-3-ultra-free",
  "nemotron-3.5-lightning-free",
  "mimo-v2.5-free",
  "ling-3.0-flash-fin-free",
  "deepseek-v4-flash-free",
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
] as const;

export type OpenCodeZenFreeModel = (typeof OPENCODE_ZEN_FREE_MODELS)[number];

export const OPENCODE_ZEN_STRONG_MODEL: OpenCodeZenFreeModel = "nemotron-3-ultra-free";
export const OPENCODE_ZEN_FAST_MODEL: OpenCodeZenFreeModel = "nemotron-3.5-lightning-free";

export const CEREBRAS_CATALOG = [
  { id: "llama3.1-8b", name: "Llama 3.1 8B", badge: "fast", contextWindow: 8192 },
  { id: "llama3.3-70b", name: "Llama 3.3 70B", badge: "flagship", contextWindow: 8192 },
] as const;

export function remapUnavailableGroqModelId(modelId: string): string {
  return /llama-3\.3-70b-versatile/i.test(modelId)
    ? modelId.replace(/llama-3\.3-70b-versatile/i, GROQ_LIVE_FALLBACK_NATIVE)
    : modelId;
}

export function isUnsupportedListedModel(id: string): boolean {
  return /(?:^|\/)llama-3\.3-70b-versatile$|kimi-k2\.6|nemotron-3-ultra-550b-a55b|nemotron-ultra-253b|claude-3\.5-sonnet|claude-3-5-sonnet|gemini-1\.5-pro|gemini-1\.5-flash|whisper|tts|transcribe|orpheus|playai|:batch\b|prompt-guard|llama-guard|nemoguard|safety[-_ ]?guard|moderation|embed(?:ding)?s?|rerank|content-safety|safeguard|vision|image|audio|diffusion|deplot|fuyu|nano[- ]?banana/i.test(id);
}

export function isOpenRouterFreeListedModel(
  id: string,
  pricing?: OpenRouterPricingHint,
): boolean {
  if (/:free$/i.test(id.trim())) return true;
  if (!pricing) return false;
  const prompt = Number(pricing.prompt);
  const completion = Number(pricing.completion);
  return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
}

export function filterUnsupportedListedModels<T extends { id: string }>(models: T[]): T[] {
  return models.filter((model) => !isUnsupportedListedModel(model.id));
}

export function buildPrefixedModelId(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function isOpenCodeZenFreeModel(modelId: string): boolean {
  const id = String(modelId ?? "").trim().toLowerCase();
  if (!id) return false;
  return (OPENCODE_ZEN_FREE_MODELS as readonly string[]).includes(id);
}

export function filterOpenCodeZenFreeModels(modelIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of modelIds) {
    const id = String(raw ?? "").trim();
    if (!id || !isOpenCodeZenFreeModel(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
