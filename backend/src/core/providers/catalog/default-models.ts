import type { ProviderName } from "../provider-types.js";
import { OPENCODE_ZEN_FAST_MODEL, OPENCODE_ZEN_STRONG_MODEL } from "./policy.js";
import type { CatalogFallbackModel } from "./types.js";

export const DEFAULT_NATIVE_MODELS: Record<ProviderName, string> = {
  groq: "openai/gpt-oss-120b",
  openrouter: "qwen/qwen3-32b:free",
  gemini: "gemini-2.5-pro",
  nvidia: "nvidia/llama-3.3-nemotron-super-49b-v1",
  github: "openai/gpt-4.1",
  cerebras: OPENCODE_ZEN_STRONG_MODEL,
  openai: "gpt-4.1",
  opencode: OPENCODE_ZEN_STRONG_MODEL,
};

export const STRONG_FALLBACK_MODELS: CatalogFallbackModel[] = [
  { providerName: "opencode", model: OPENCODE_ZEN_STRONG_MODEL },
  { providerName: "groq", model: "openai/gpt-oss-120b" },
  { providerName: "openrouter", model: "qwen/qwen3-32b:free" },
  { providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" },
  { providerName: "github", model: "openai/gpt-4.1" },
  { providerName: "gemini", model: "gemini-2.5-pro" },
  { providerName: "openai", model: "gpt-4.1" },
];

export const FAST_FALLBACK_MODELS: CatalogFallbackModel[] = [
  { providerName: "opencode", model: OPENCODE_ZEN_FAST_MODEL },
  { providerName: "groq", model: "llama-3.1-8b-instant" },
  { providerName: "openrouter", model: "qwen/qwen3-32b:free" },
  { providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" },
  { providerName: "github", model: "openai/gpt-4.1-mini" },
  { providerName: "gemini", model: "gemini-2.5-flash" },
  { providerName: "openai", model: "gpt-4.1-mini" },
];

export const ROLE_FALLBACK_MODELS: CatalogFallbackModel[] = [
  { providerName: "opencode", model: OPENCODE_ZEN_STRONG_MODEL },
  { providerName: "groq", model: "openai/gpt-oss-120b" },
  { providerName: "openrouter", model: "qwen/qwen3-32b:free" },
  { providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" },
  { providerName: "github", model: "openai/gpt-4.1" },
  { providerName: "gemini", model: "gemini-2.5-flash" },
];
