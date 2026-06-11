// src/lib/provider-router.ts
// ─────────────────────────────────────────────────────────────
// Central provider routing layer (Antigravity abstraction).
// Maps "provider/model-id" strings → SDK client + stripped model ID.
// ─────────────────────────────────────────────────────────────
import type { ResolvedProvider, RequestKeys } from "./types.js";
import { getGroqClient }       from "./groq-client.js";
import { getOllamaClient }     from "./ollama-client.js";
import { getNvidiaClient }     from "./nvidia-client.js";
import { getGeminiClient }     from "./gemini-client.js";
import { getOpenRouterClient } from "./openrouter-client.js";
import { getGithubModelsClient } from "./github-models-client.js";
import { getCerebrasClient }   from "./cerebras-client.js";
import { getOpenAIClient }     from "./openai-client.js";
import { extractProviderKeys } from "../core/providers/provider-key-extraction.js";
export { ProviderRouterError, SUPPORTED_PROVIDER_PREFIXES, parseProviderModelId } from "../core/providers/provider-model-id.js";
import { parseProviderModelId, ProviderRouterError, SUPPORTED_PROVIDER_PREFIXES } from "../core/providers/provider-model-id.js";

/**
 * Resolve a prefixed model ID (e.g. "groq/llama-3.3-70b-versatile")
 * into a provider client + stripped model ID.
 *
 * @throws {Error} if the prefix is unknown or the required key is missing
 */
export function resolveProvider(
  prefixedModelId: string,
  keys: RequestKeys
): ResolvedProvider {
  const { prefix, modelId } = parseProviderModelId(prefixedModelId);

  switch (prefix) {
    case "groq":
      return {
        client:   getGroqClient(keys.groqKey),
        modelId,
        provider: "groq",
      };

    case "ollama":
      return {
        client:   getOllamaClient(keys.ollamaKey, keys.ollamaBase),
        modelId,
        provider: "ollama",
      };

    case "nvidia":
      // NVIDIA NIM model IDs already include org prefix (e.g. "nvidia/llama-3.3-nemotron-super-49b-v1")
      // After stripping the "nvidia/" prefix we get "nvidia/llama-3.3-..." which is CORRECT for the API.
      return {
        client:   getNvidiaClient(keys.nvidiaKey),
        modelId,
        provider: "nvidia",
      };

    case "gemini":
      return {
        client:   getGeminiClient(keys.geminiKey),
        modelId,
        provider: "gemini",
      };

    case "openrouter":
      return {
        client:   getOpenRouterClient(keys.openrouterKey),
        modelId,
        provider: "openrouter",
      };

    case "github":
      return {
        client:   getGithubModelsClient(keys.githubToken),
        modelId,
        provider: "github",
      };

    case "cerebras":
      return {
        client:   getCerebrasClient(keys.cerebrasKey),
        modelId,
        provider: "cerebras",
      };

    case "openai":
      return {
        client:   getOpenAIClient(keys.openaiKey),
        modelId,
        provider: "openai",
      };

    default:
      throw new ProviderRouterError(
        "unsupported_provider_prefix",
        `[provider-router] Unknown provider prefix: "${prefix}". ` +
          `Supported: ${SUPPORTED_PROVIDER_PREFIXES.join(", ")}.`,
      );
  }
}

/**
 * Extract RequestKeys from an Express Request object.
 * Call this ONCE at the top of every route handler.
 */
export function extractKeys(req: { headers: Record<string, string | string[] | undefined> }): RequestKeys {
  return extractProviderKeys(req);
}
