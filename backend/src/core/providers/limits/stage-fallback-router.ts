import type { ProviderName } from "../provider-types.js";
import type { ProviderStage } from "./provider-limit-types.js";

export const STAGE_FALLBACK_ORDER: Record<ProviderStage, ProviderName[]> = {
  // OpenCode Zen free models first, then Groq/OpenRouter → NVIDIA → GitHub Models
  final_generation: ["opencode", "groq", "openrouter", "nvidia", "github", "gemini", "openai"],
  core_generation: ["opencode", "groq", "openrouter", "nvidia", "github", "gemini", "openai"],
  role_generation: ["opencode", "groq", "openrouter", "nvidia", "github", "gemini"],
  repair: ["opencode", "gemini", "openai", "groq", "openrouter", "nvidia", "github"],
  synthesis: ["opencode", "gemini", "openai", "groq", "openrouter", "nvidia", "github"],
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
  const seen = new Set<ProviderName>();
  return base.filter((provider) => {
    if (provider === primaryProvider) return false;
    if (!validProviders.has(provider)) return false;
    if (seen.has(provider)) return false;
    seen.add(provider);
    return true;
  });
}
