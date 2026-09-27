import {
  CEREBRAS_CATALOG,
  OPENCODE_ZEN_FREE_MODELS,
} from "./policy.js";
import type { CatalogModel } from "./types.js";

export function readableCatalogModelName(id: string): string {
  const last = id.split("/").pop() ?? id;
  if (/kimi-k2\.6/i.test(id)) return "Kimi K2.6";
  if (/nemotron-ultra/i.test(id)) return "Nemotron Ultra";
  if (/nemotron-super/i.test(id)) return "Nemotron Super";
  return last.split(/[-_]/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export const GROQ_CATALOG: CatalogModel[] = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", ownedBy: "openai", badge: "flagship" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", ownedBy: "meta", badge: "fast" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", ownedBy: "openai", badge: "fast" },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B", ownedBy: "qwen", badge: "reason" },
];

export const OPENROUTER_CATALOG: CatalogModel[] = [
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (free)", ownedBy: "meta", badge: "free" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", ownedBy: "meta", badge: "free" },
  { id: "qwen/qwen3-32b:free", name: "Qwen3 32B (free)", ownedBy: "qwen", badge: "free" },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (free)", ownedBy: "deepseek", badge: "free" },
  { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B (free)", ownedBy: "google", badge: "free" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 (free)", ownedBy: "mistralai", badge: "free" },
];

export const OLLAMA_CATALOG: CatalogModel[] = [
  { id: "llama3.3", name: "Llama 3.3", ownedBy: "meta", badge: "flagship" },
  { id: "llama3.1", name: "Llama 3.1", ownedBy: "meta", badge: "stable" },
  { id: "mistral", name: "Mistral", ownedBy: "mistral", badge: "stable" },
  { id: "qwen2.5", name: "Qwen 2.5", ownedBy: "qwen", badge: "reason" },
  { id: "deepseek-r1", name: "DeepSeek R1", ownedBy: "deepseek", badge: "reason" },
  { id: "gemma2", name: "Gemma 2", ownedBy: "google", badge: "fast" },
  { id: "phi4", name: "Phi-4", ownedBy: "microsoft", badge: "compact" },
];

export const NVIDIA_CATALOG: CatalogModel[] = [
  { id: "deepseek-ai/deepseek-v4-0324", name: "DeepSeek V4", ownedBy: "deepseek", badge: "reason" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1", name: "Nemotron Super", ownedBy: "nvidia", badge: "flagship" },
  { id: "nvidia/llama-3.1-nemotron-nano-8b-v1", name: "Nemotron Nano", ownedBy: "nvidia", badge: "fast" },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", ownedBy: "meta", badge: "meta" },
  { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", ownedBy: "meta", badge: "fast" },
  { id: "mistralai/mistral-large-2-instruct", name: "Mistral Large 2", ownedBy: "mistralai", badge: "mistral" },
  { id: "google/gemma-3-27b-it", name: "Gemma 3 27B", ownedBy: "google", badge: "google" },
  { id: "qwen/qwen2.5-72b-instruct", name: "Qwen 2.5 72B", ownedBy: "qwen", badge: "reason" },
];

export const GITHUB_MODELS_CATALOG: CatalogModel[] = [
  { id: "openai/gpt-4.1", name: "GPT-4.1", ownedBy: "openai", badge: "flagship" },
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", ownedBy: "openai", badge: "fast" },
  { id: "openai/gpt-4o", name: "GPT-4o", ownedBy: "openai", badge: "stable" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", ownedBy: "openai", badge: "fast" },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", ownedBy: "meta", badge: "meta" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", ownedBy: "deepseek", badge: "reason" },
  { id: "microsoft/phi-4", name: "Phi-4", ownedBy: "microsoft", badge: "compact" },
  { id: "mistral-ai/mistral-large", name: "Mistral Large", ownedBy: "mistral-ai", badge: "mistral" },
];

export const CEREBRAS_MODELS_CATALOG: CatalogModel[] = CEREBRAS_CATALOG.map((model) => ({
  id: model.id,
  name: model.name,
  ownedBy: "cerebras",
  badge: model.badge,
  contextWindow: model.contextWindow,
}));

export const OPENCODE_ZEN_MODELS_CATALOG: CatalogModel[] = OPENCODE_ZEN_FREE_MODELS.map((id) => ({
  id,
  name: readableCatalogModelName(id),
  ownedBy: "opencode",
  badge: id === "big-pickle" || id.includes("free") ? "free" : undefined,
}));
