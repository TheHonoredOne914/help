import { parseProviderModelId } from "../../lib/provider-router.js";
import type { RequestKeys } from "../../lib/types.js";
import { ProviderRouter as CoreProviderRouter } from "../../core/providers/provider-router.js";
import { GroqProvider } from "../../core/providers/groq-provider.js";
import { OpenRouterProvider } from "../../core/providers/openrouter-provider.js";
import { GeminiProvider } from "../../core/providers/gemini-provider.js";
import { NvidiaProvider } from "../../core/providers/nvidia-provider.js";
import { GithubProvider } from "../../core/providers/github-provider.js";
import { CerebrasProvider } from "../../core/providers/cerebras-provider.js";
import { OpenCodeZenProvider } from "../../core/providers/opencode-zen-provider.js";
import type { ProviderName } from "../../core/providers/provider-types.js";
import { multiKeyFetch } from "../../lib/multi-key-fetch.js";
import { isOpenRouterFreeListedModel, remapUnavailableGroqModelId } from "../../core/providers/catalog/index.js";

export function buildCoreProviderRouter(
  keys: RequestKeys,
  rawModelId: string,
): { router?: CoreProviderRouter; providerName?: ProviderName; model?: string; error?: string } {
  const parsed = parseProviderModelId(rawModelId);
  const router = new CoreProviderRouter();
  const opencodeKey = keys.opencodeKey ?? process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_ZEN_API_KEY;
  if (opencodeKey) router.register(new OpenCodeZenProvider({ apiKey: opencodeKey, fetchFn: multiKeyFetch }));
  if (keys.groqKey || process.env.GROQ_API_KEY) router.register(new GroqProvider({ apiKey: keys.groqKey ?? process.env.GROQ_API_KEY, fetchFn: multiKeyFetch }));
  const openrouterKey = keys.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY;
  if (openrouterKey) router.register(new OpenRouterProvider({ apiKey: openrouterKey, fetchFn: multiKeyFetch }));
  if (keys.geminiKey || process.env.GEMINI_API_KEY) router.register(new GeminiProvider({ apiKey: keys.geminiKey ?? process.env.GEMINI_API_KEY, fetchFn: multiKeyFetch }));
  if (keys.nvidiaKey || process.env.NVIDIA_API_KEY) router.register(new NvidiaProvider({ apiKey: keys.nvidiaKey ?? process.env.NVIDIA_API_KEY, fetchFn: multiKeyFetch }));
  const githubToken = keys.githubToken ?? process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN;
  if (githubToken) router.register(new GithubProvider({ apiKey: githubToken, fetchFn: multiKeyFetch }));
  const cerebrasKey = keys.cerebrasKey ?? process.env.CEREBRAS_API_KEY;
  if (cerebrasKey) router.register(new CerebrasProvider({ apiKey: cerebrasKey, fetchFn: multiKeyFetch }));
  if (parsed.prefix === "opencode") {
    if (!opencodeKey) return { error: "OpenCode Zen provider unavailable: missing API key" };
    return { router, providerName: "opencode", model: parsed.modelId };
  }
  if (parsed.prefix === "groq") {
    if (!keys.groqKey && !process.env.GROQ_API_KEY) return { error: "Groq provider unavailable: missing API key" };
    return { router, providerName: "groq", model: remapUnavailableGroqModelId(parsed.modelId) };
  }
  if (parsed.prefix === "openrouter") {
    if (!openrouterKey) return { error: "OpenRouter provider unavailable: missing API key" };
    if (!isOpenRouterFreeListedModel(parsed.modelId)) {
      return { error: "OpenRouter is limited to free models. Choose a model whose id ends with :free." };
    }
    return { router, providerName: "openrouter", model: parsed.modelId };
  }
  if (parsed.prefix === "gemini") {
    if (!keys.geminiKey && !process.env.GEMINI_API_KEY) return { error: "Gemini provider unavailable: missing API key" };
    return { router, providerName: "gemini", model: parsed.modelId };
  }
  if (parsed.prefix === "nvidia") {
    if (!keys.nvidiaKey && !process.env.NVIDIA_API_KEY) return { error: "NVIDIA provider unavailable: missing API key" };
    return { router, providerName: "nvidia", model: parsed.modelId };
  }
  if (parsed.prefix === "github") {
    if (!githubToken) return { error: "GitHub Models provider unavailable: missing token" };
    return { router, providerName: "github", model: parsed.modelId };
  }
  if (parsed.prefix === "cerebras") {
    if (!cerebrasKey) return { error: "Cerebras provider unavailable: missing API key" };
    return { router, providerName: "cerebras", model: parsed.modelId };
  }
  return { error: `Core model-backed generation does not support provider prefix '${parsed.prefix}'` };
}
