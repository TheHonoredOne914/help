import type { ProviderName } from "../provider-types.js";
import type { ProviderStage } from "./provider-limit-types.js";

export const STAGE_FALLBACK_ORDER: Record<ProviderStage, ProviderName[]> = {
  final_generation: ["nvidia", "gemini", "openai", "openrouter", "groq", "github", "cerebras"],
  core_generation: ["nvidia", "gemini", "openai", "openrouter", "groq", "github", "cerebras"],
  role_generation: ["groq", "nvidia", "gemini", "openrouter", "github", "cerebras"],
  repair: ["gemini", "openai", "groq", "nvidia", "openrouter", "cerebras"],
  synthesis: ["gemini", "openai", "nvidia", "openrouter", "groq", "cerebras"],
  extraction: ["firecrawl", "jina"] as unknown as ProviderName[],
  search: ["tavily", "serper", "exa", "brave"] as unknown as ProviderName[],
};

export function getFallbackOrderForStage(
  stage: ProviderStage,
  primaryProvider: ProviderName,
  availableProviders: ProviderName[],
): ProviderName[] {
  const base = STAGE_FALLBACK_ORDER[stage] ?? [];
  const validProviders = new Set(availableProviders);
  const ordered = [primaryProvider, ...base];
  const seen = new Set<ProviderName>();
  return ordered.filter((provider) => {
    if (!validProviders.has(provider)) return false;
    if (seen.has(provider)) return false;
    seen.add(provider);
    return true;
  });
}
