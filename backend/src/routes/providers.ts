import { Router } from "express";
import crypto from "node:crypto";
import { tavily } from "@tavily/core";
import { getGroqClient, isGroqEnabled } from "../lib/groq-client.js";
import { getOllamaClient, isOllamaEnabled } from "../lib/ollama-client.js";
import { isNvidiaEnabled, NVIDIA_BASE_URL } from "../lib/nvidia-client.js";
import { getGeminiClient } from "../lib/gemini-client.js";
import { CEREBRAS_BASE_URL, CEREBRAS_CATALOG } from "../lib/cerebras-client.js";
import { multiKeyFetch } from "../lib/multi-key-fetch.js";
import { extractKeys } from "../lib/provider-router.js";
import type { RequestKeys } from "../lib/types.js";
import { redactSecretString } from "../core/security/secret-redaction.js";
import { buildSearchProviderStatus } from "../core/search/search-provider-status.js";
import { deriveProviderHealthPolicy } from "../core/providers/provider-health-policy.js";
import { logProviderCall } from "../core/providers/provider-call-logger.js";
import {
  httpStatusForProviderStatus as modelRouteHttpStatusForProviderStatus,
  normalizeProviderModelRoutePayload,
} from "../core/providers/provider-model-route-contract.js";
import type { ProviderRouteStatus, ProviderStatusContract } from "../core/providers/provider-status-contract.js";

const router = Router();

export interface ProviderModelListItem {
  id: string;
  name?: string;
  created?: number;
  ownedBy?: string;
  badge?: string;
  contextWindow?: number;
}

export interface ProviderModelListPayload {
  provider: string;
  configured: boolean;
  healthy: boolean;
  status: ProviderRouteStatus;
  source: "live" | "catalog_fallback";
  models: ProviderModelListItem[];
  modelCount?: number;
  error?: string;
  latencyMs?: number;
  canChat?: boolean;
  chatVerified?: boolean;
  canListModels?: boolean;
  liveModelListVerified?: boolean;
  catalogFallbackOnly?: boolean;
}

export const GROQ_CATALOG: ProviderModelListItem[] = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", ownedBy: "meta", badge: "flagship" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", ownedBy: "meta", badge: "fast" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", ownedBy: "openai", badge: "flagship" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", ownedBy: "openai", badge: "fast" },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B", ownedBy: "qwen", badge: "reason" },
];

export const OPENROUTER_CATALOG: ProviderModelListItem[] = [
  { id: "openai/gpt-4.1", name: "GPT-4.1", ownedBy: "openai", badge: "flagship" },
  { id: "openai/gpt-4o", name: "GPT-4o", ownedBy: "openai", badge: "stable" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", ownedBy: "openai", badge: "fast" },
  { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4", ownedBy: "anthropic", badge: "flagship" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", ownedBy: "google", badge: "flagship" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", ownedBy: "google", badge: "fast" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", ownedBy: "meta", badge: "meta" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", ownedBy: "deepseek", badge: "reason" },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B", ownedBy: "qwen", badge: "reason" },
];

export const OLLAMA_CATALOG: ProviderModelListItem[] = [
  { id: "llama3.3", name: "Llama 3.3", ownedBy: "meta", badge: "flagship" },
  { id: "llama3.1", name: "Llama 3.1", ownedBy: "meta", badge: "stable" },
  { id: "mistral", name: "Mistral", ownedBy: "mistral", badge: "stable" },
  { id: "qwen2.5", name: "Qwen 2.5", ownedBy: "qwen", badge: "reason" },
  { id: "deepseek-r1", name: "DeepSeek R1", ownedBy: "deepseek", badge: "reason" },
  { id: "gemma2", name: "Gemma 2", ownedBy: "google", badge: "fast" },
  { id: "phi4", name: "Phi-4", ownedBy: "microsoft", badge: "compact" },
];

export const NVIDIA_CATALOG: ProviderModelListItem[] = [
  { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", ownedBy: "moonshotai", badge: "agentic" },
  { id: "deepseek-ai/deepseek-v4-0324", name: "DeepSeek V4", ownedBy: "deepseek", badge: "reason" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1", name: "Nemotron Super", ownedBy: "nvidia", badge: "flagship" },
  { id: "nvidia/llama-3.1-nemotron-nano-8b-v1", name: "Nemotron Nano", ownedBy: "nvidia", badge: "fast" },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", ownedBy: "meta", badge: "meta" },
  { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", ownedBy: "meta", badge: "fast" },
  { id: "mistralai/mistral-large-2-instruct", name: "Mistral Large 2", ownedBy: "mistralai", badge: "mistral" },
  { id: "google/gemma-3-27b-it", name: "Gemma 3 27B", ownedBy: "google", badge: "google" },
  { id: "qwen/qwen2.5-72b-instruct", name: "Qwen 2.5 72B", ownedBy: "qwen", badge: "reason" },
];

export const GITHUB_MODELS_CATALOG: ProviderModelListItem[] = [
  { id: "openai/gpt-4.1", name: "GPT-4.1", ownedBy: "openai", badge: "flagship" },
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", ownedBy: "openai", badge: "fast" },
  { id: "openai/gpt-4o", name: "GPT-4o", ownedBy: "openai", badge: "stable" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", ownedBy: "openai", badge: "fast" },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", ownedBy: "meta", badge: "meta" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", ownedBy: "deepseek", badge: "reason" },
  { id: "microsoft/phi-4", name: "Phi-4", ownedBy: "microsoft", badge: "compact" },
  { id: "mistral-ai/mistral-large", name: "Mistral Large", ownedBy: "mistral-ai", badge: "mistral" },
];

export const CEREBRAS_MODELS_CATALOG: ProviderModelListItem[] = CEREBRAS_CATALOG.map((model) => ({
  id: model.id,
  name: model.name,
  ownedBy: "cerebras",
  badge: model.badge,
  contextWindow: model.contextWindow,
}));

const providerStatusCache = new Map<string, { expiresAt: number; payload: ProviderStatusPayload }>();

export function buildPrefixedModelId(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function normalizeNvidiaModels(data: unknown): ProviderModelListItem[] {
  const raw = Array.isArray((data as any)?.data) ? (data as any).data : Array.isArray(data) ? data as any[] : [];
  return dedupeModels([
    ...raw.map((item: any) => ({
      id: String(item.id ?? item.name ?? "").trim(),
      name: item.display_name ?? item.name ?? readableModelName(String(item.id ?? "")),
      ownedBy: item.owned_by ?? ownedByFromId(String(item.id ?? "")),
      badge: badgeForNvidiaModel(String(item.id ?? "")),
      contextWindow: item.context_window ?? item.context_length,
    })).filter((item: ProviderModelListItem) => item.id),
  ]);
}

export function normalizeCerebrasModels(data: unknown): ProviderModelListItem[] {
  const raw = Array.isArray((data as any)?.data) ? (data as any).data : Array.isArray(data) ? data as any[] : [];
  return dedupeModels([
    ...raw.map((item: any) => ({
      id: String(item.id ?? item.name ?? "").trim(),
      name: item.display_name ?? item.name ?? readableModelName(String(item.id ?? "")),
      ownedBy: item.owned_by ?? "cerebras",
      badge: item.badge ?? badgeForCerebrasModel(String(item.id ?? "")),
      contextWindow: item.context_window ?? item.context_length,
    })).filter((item: ProviderModelListItem) => item.id),
  ]);
}

export async function listNvidiaModels(apiKey: string | null | undefined, fetchFn: typeof fetch = multiKeyFetch): Promise<ProviderModelListPayload> {
  if (!apiKey?.trim()) throw new ProviderRouteError("missing_key", "NVIDIA API key is not configured. Provide one in Settings -> Keys.", 400);
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(fetchFn, `${NVIDIA_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    }, 12_000);
    if (!response.ok) {
      const body = redactKnownSecret(await safeResponseText(response), apiKey);
      throw new ProviderRouteError(statusFromHttp(response.status), `NVIDIA models endpoint returned ${response.status}: ${body}`, response.status);
    }
    const liveModels = normalizeNvidiaModels(await response.json());
    const displayModels = dedupeModels([...liveModels, ...NVIDIA_CATALOG]).sort(sortModels);
    return {
      provider: "nvidia",
      configured: true,
      healthy: liveModels.length > 0,
      status: liveModels.length > 0 ? "healthy" : "network_error",
      source: "live",
      models: displayModels,
      modelCount: displayModels.length,
      chatVerified: liveModels.length > 0,
      canChat: liveModels.length > 0,
      canListModels: true,
      liveModelListVerified: liveModels.length > 0,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const status = err instanceof ProviderRouteError ? err.code as ProviderRouteStatus : statusCodeFromError(err);
    const invalidOrRateLimited = status === "invalid_key" || status === "rate_limited";
    const displayModels = invalidOrRateLimited ? [] : [...NVIDIA_CATALOG].sort(sortModels);
    return {
      provider: "nvidia",
      configured: true,
      healthy: false,
      status: invalidOrRateLimited ? status : "catalog_fallback",
      source: "catalog_fallback",
      models: displayModels,
      modelCount: displayModels.length,
      chatVerified: false,
      canChat: false,
      canListModels: !invalidOrRateLimited,
      liveModelListVerified: false,
      catalogFallbackOnly: true,
      error: redactKnownSecret(safeMessage(err, "Failed to verify NVIDIA models"), apiKey),
      latencyMs: Date.now() - started,
    };
  }
}

export async function listGithubModels(token: string | null | undefined, fetchFn: typeof fetch = multiKeyFetch): Promise<ProviderModelListPayload> {
  if (!token?.trim()) throw new ProviderRouteError("missing_key", "GitHub Models token is not configured. Provide GITHUB_TOKEN or GITHUB_MODELS_API_KEY.", 400);
  const started = Date.now();
  try {
    await validateGithubModelsToken(token, fetchFn);
    const models = [...GITHUB_MODELS_CATALOG].sort(sortModels);
    return {
      provider: "github",
      configured: true,
      healthy: false,
      status: "unverified",
      source: "catalog_fallback",
      models,
      modelCount: models.length,
      canChat: false,
      chatVerified: false,
      canListModels: true,
      liveModelListVerified: false,
      catalogFallbackOnly: true,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const status = err instanceof ProviderRouteError ? err.code as ProviderRouteStatus : statusCodeFromError(err);
    const models = [...GITHUB_MODELS_CATALOG].sort(sortModels);
    return {
      provider: "github",
      configured: true,
      healthy: false,
      status: "catalog_fallback",
      source: "catalog_fallback",
      models,
      modelCount: models.length,
      canChat: false,
      chatVerified: false,
      canListModels: true,
      liveModelListVerified: false,
      catalogFallbackOnly: true,
      error: redactKnownSecret(safeMessage(err, "Failed to verify GitHub Models token"), token),
      latencyMs: Date.now() - started,
    };
  }
}

export async function listCerebrasModels(apiKey: string | null | undefined, fetchFn: typeof fetch = multiKeyFetch): Promise<ProviderModelListPayload> {
  if (!apiKey?.trim()) throw new ProviderRouteError("missing_key", "Cerebras API key is not configured. Provide one in Settings -> Keys.", 400);
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(fetchFn, `${CEREBRAS_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    }, 12_000);
    if (!response.ok) {
      const body = redactKnownSecret(await safeResponseText(response), apiKey);
      throw new ProviderRouteError(statusFromHttp(response.status), `Cerebras models endpoint returned ${response.status}: ${body}`, response.status);
    }
    const liveModels = normalizeCerebrasModels(await response.json());
    const displayModels = dedupeModels([...liveModels, ...CEREBRAS_MODELS_CATALOG]).sort(sortModels);
    return {
      provider: "cerebras",
      configured: true,
      healthy: liveModels.length > 0,
      status: liveModels.length > 0 ? "healthy" : "network_error",
      source: "live",
      models: displayModels,
      modelCount: displayModels.length,
      chatVerified: liveModels.length > 0,
      canChat: liveModels.length > 0,
      canListModels: true,
      liveModelListVerified: liveModels.length > 0,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const status = err instanceof ProviderRouteError ? err.code as ProviderRouteStatus : statusCodeFromError(err);
    const invalidOrRateLimited = status === "invalid_key" || status === "rate_limited";
    const displayModels = invalidOrRateLimited ? [] : [...CEREBRAS_MODELS_CATALOG].sort(sortModels);
    return {
      provider: "cerebras",
      configured: true,
      healthy: false,
      status: invalidOrRateLimited ? status : "catalog_fallback",
      source: "catalog_fallback",
      models: displayModels,
      modelCount: displayModels.length,
      chatVerified: false,
      canChat: false,
      canListModels: !invalidOrRateLimited,
      liveModelListVerified: false,
      catalogFallbackOnly: true,
      error: redactKnownSecret(safeMessage(err, "Failed to verify Cerebras models"), apiKey),
      latencyMs: Date.now() - started,
    };
  }
}

router.get("/groq/models", async (req, res) => {
  const keys = extractKeys(req);
  if (!isGroqEnabled(keys.groqKey)) {
    sendProviderModelPayload(res, providerRouteErrorPayload("groq", "missing_key", "Groq API key is not configured. Provide one in Settings -> Keys.", false));
    return;
  }
  const started = Date.now();
  try {
    const list = await getGroqClient(keys.groqKey).models.list();
    const models = list.data
      .filter((m) => (m as any).object === "model")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, created: m.created, ownedBy: (m as any).owned_by ?? "groq" }));
    sendProviderModelPayload(res, { provider: "groq", configured: true, healthy: models.length > 0, status: models.length > 0 ? "healthy" : "network_error", source: "live", models, modelCount: models.length, latencyMs: Date.now() - started });
  } catch (err: any) {
    const status = statusCodeFromError(err);
    // Return catalog for ALL errors, not just network_error. A key valid for chat should
    // not be labelled "invalid" just because the /models endpoint rejects it.
    const fallbackModels = [...GROQ_CATALOG].sort(sortModels);
    sendProviderModelPayload(res, {
      provider: "groq",
      configured: true,
      healthy: false,
      status: "catalog_fallback",
      source: "catalog_fallback",
      models: fallbackModels,
      modelCount: fallbackModels.length,
      error: safeMessage(err, "Failed to list Groq models"),
      latencyMs: Date.now() - started,
    });
  }
});

router.get("/ollama/models", async (req, res) => {
  const keys = extractKeys(req);
  if (!isOllamaEnabled(keys.ollamaKey)) {
    sendProviderModelPayload(res, providerRouteErrorPayload("ollama", "missing_key", "Ollama API key is not configured. Provide one in Settings -> Keys.", false));
    return;
  }
  const started = Date.now();
  try {
    const list = await getOllamaClient(keys.ollamaKey, keys.ollamaBase).models.list();
    const models = list.data
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, created: m.created, ownedBy: (m as any).owned_by ?? "ollama" }));
    sendProviderModelPayload(res, { provider: "ollama", configured: true, healthy: models.length > 0, status: models.length > 0 ? "healthy" : "network_error", source: "live", models, modelCount: models.length, latencyMs: Date.now() - started });
  } catch (err: any) {
    const status = statusCodeFromError(err);
    const fallbackModels = status === "network_error" ? [...OLLAMA_CATALOG] : [];
    sendProviderModelPayload(res, {
      provider: "ollama",
      configured: true,
      healthy: false,
      status,
      source: fallbackModels.length > 0 ? "catalog_fallback" : "live",
      models: fallbackModels,
      modelCount: fallbackModels.length,
      error: safeMessage(err, "Failed to list Ollama models"),
      latencyMs: Date.now() - started,
    });
  }
});

router.get("/nvidia/models", async (req, res) => {
  const keys = extractKeys(req);
  if (!isNvidiaEnabled(keys.nvidiaKey)) {
    sendProviderModelPayload(res, providerRouteErrorPayload("nvidia", "missing_key", "NVIDIA API key is not configured. Provide one in Settings -> Keys.", false));
    return;
  }
  try {
    sendProviderModelPayload(res, await listNvidiaModels(keys.nvidiaKey ?? process.env.NVIDIA_API_KEY));
  } catch (err: any) {
    sendProviderModelPayload(res, providerRouteErrorPayload("nvidia", err.code ?? statusCodeFromError(err), safeMessage(err, "Failed to list NVIDIA models"), Boolean(keys.nvidiaKey ?? process.env.NVIDIA_API_KEY)));
  }
});

router.get("/github/models", async (req, res) => {
  const keys = extractKeys(req);
  const token = keys.githubToken ?? process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? null;
  if (!token) {
    sendProviderModelPayload(res, providerRouteErrorPayload("github", "missing_key", "GitHub Models token is not configured. Provide GITHUB_TOKEN or GITHUB_MODELS_API_KEY.", false));
    return;
  }
  try {
    sendProviderModelPayload(res, await listGithubModels(token));
  } catch (err: any) {
    sendProviderModelPayload(res, providerRouteErrorPayload("github", err.code ?? statusCodeFromError(err), safeMessage(err, "Failed to list GitHub Models"), true));
  }
});

router.get("/cerebras/models", async (req, res) => {
  const keys = extractKeys(req);
  const key = keys.cerebrasKey ?? process.env.CEREBRAS_API_KEY ?? "";
  if (!key) {
    sendProviderModelPayload(res, providerRouteErrorPayload("cerebras", "missing_key", "Cerebras API key is not configured. Provide one in Settings -> Keys.", false));
    return;
  }
  try {
    sendProviderModelPayload(res, await listCerebrasModels(key));
  } catch (err: any) {
    sendProviderModelPayload(res, providerRouteErrorPayload("cerebras", err.code ?? statusCodeFromError(err), safeMessage(err, "Failed to list Cerebras models"), true));
  }
});

router.get("/gemini/models", async (req, res) => {
  const keys = extractKeys(req);
  const key = keys.geminiKey ?? process.env.GEMINI_API_KEY ?? "";
  const started = Date.now();
  const catalog = [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", badge: "flagship", contextWindow: 2097152 },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "fast", contextWindow: 1048576 },
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", badge: "fast", contextWindow: 1048576 },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", badge: "stable", contextWindow: 1048576 },
    { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", badge: "reason", contextWindow: 1048576 },
  ];
  if (!key) {
    sendProviderModelPayload(res, providerRouteErrorPayload("gemini", "missing_key", "Gemini API key is not configured. Provide one in Settings -> Keys.", false));
    return;
  }
  try {
    await getGeminiClient(key).models.list();
    sendProviderModelPayload(res, {
      provider: "gemini",
      configured: true,
      healthy: true,
      status: "healthy",
      source: "live",
      models: catalog,
      modelCount: catalog.length,
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    const status = statusCodeFromError(err);
    const catalog = [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", badge: "flagship", contextWindow: 2097152 },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "fast", contextWindow: 1048576 },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", badge: "fast", contextWindow: 1048576 },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", badge: "stable", contextWindow: 1048576 },
      { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", badge: "reason", contextWindow: 1048576 },
    ];
    const fallbackModels = status === "network_error" ? catalog : [];
    sendProviderModelPayload(res, {
      provider: "gemini",
      configured: true,
      healthy: false,
      status,
      source: fallbackModels.length > 0 ? "catalog_fallback" : "live",
      models: fallbackModels,
      modelCount: fallbackModels.length,
      error: safeMessage(err, "Failed to verify Gemini key"),
      latencyMs: Date.now() - started,
    });
  }
});

router.get("/gemini/catalog", (_req, res) => {
  res.json({
    provider: "gemini",
    configured: false,
    healthy: false,
    status: "unverified",
    source: "catalog_fallback",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", badge: "flagship", contextWindow: 2097152 },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "fast", contextWindow: 1048576 },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", badge: "fast", contextWindow: 1048576 },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", badge: "stable", contextWindow: 1048576 },
      { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", badge: "reason", contextWindow: 1048576 },
    ],
  });
});

router.get("/openrouter/models", async (req, res) => {
  const keys = extractKeys(req);
  const key = keys.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY ?? "";
  if (!key) {
    sendProviderModelPayload(res, providerRouteErrorPayload("openrouter", "missing_key", "OpenRouter API key not configured. Add it in Settings -> Keys.", false));
    return;
  }
  const started = Date.now();
  try {
    const resp = await fetchWithTimeout(fetch, "https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    }, 12_000);
    if (!resp.ok) throw new ProviderRouteError(statusFromHttp(resp.status), `OpenRouter ${resp.status}: ${await safeResponseText(resp)}`, resp.status);
    const data = await resp.json() as { data?: Array<{ id: string; name?: string; context_length?: number; owned_by?: string }> };
    const ALLOWED = ["openai", "anthropic", "google", "meta-llama", "mistralai", "deepseek", "qwen", "nvidia", "cohere", "microsoft", "x-ai", "moonshotai"];
    const models = (data.data ?? [])
      .filter((m) => ALLOWED.some((org) => m.id.startsWith(org)))
      .map((m) => ({ id: m.id, name: m.name ?? m.id, contextWindow: m.context_length ?? 0, ownedBy: m.owned_by ?? "openrouter" }))
      .sort(sortModels);
    sendProviderModelPayload(res, { provider: "openrouter", configured: true, healthy: models.length > 0, status: models.length > 0 ? "healthy" : "network_error", source: "live", models, modelCount: models.length, latencyMs: Date.now() - started });
  } catch (err: any) {
    const status = statusCodeFromError(err);
    const fallbackModels = status === "network_error" ? [...OPENROUTER_CATALOG] : [];
    sendProviderModelPayload(res, {
      provider: "openrouter",
      configured: true,
      healthy: false,
      status,
      source: fallbackModels.length > 0 ? "catalog_fallback" : "live",
      models: fallbackModels,
      modelCount: fallbackModels.length,
      error: safeMessage(err, "Failed to fetch OpenRouter models"),
      latencyMs: Date.now() - started,
    });
  }
});

export interface ProviderStatusPayload {
  providers: Record<string, ProviderStatusContract & { modelCount: number }>;
}

type ProviderStatusEntry = ProviderStatusPayload["providers"][string];

function configuredFromSource(browserKey: string | null | undefined, envKey: string | undefined): "browser" | "server_env" | "none" {
  if (browserKey?.trim()) return envKey?.trim() && browserKey.trim() === envKey.trim() ? "server_env" : "browser";
  if (envKey?.trim()) return "server_env";
  return "none";
}

export async function buildProviderStatusPayload(keys: RequestKeys, options: { fetchFn?: typeof fetch; cacheKey?: string; now?: number; timeoutMs?: number; bypassCache?: boolean } = {}): Promise<ProviderStatusPayload> {
  const now = options.now ?? Date.now();
  const cacheKey = options.cacheKey ?? statusCacheKey(keys);
  const cached = providerStatusCache.get(cacheKey);
  if (!options.bypassCache && cached && cached.expiresAt > now) return cached.payload;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = resolveProviderStatusTimeoutMs(options.timeoutMs);
  const checks: Array<[string, () => Promise<ProviderStatusPayload["providers"][string]>]> = [
    ["groq", () => probeProviderModels("groq", Boolean(keys.groqKey ?? process.env.GROQ_API_KEY), async () => {
      try {
        const groq = getGroqClient(keys.groqKey);
        const list = await groq.models.list();
        const models = list.data
          .filter((m) => (m as any).object === "model")
          .map((m) => ({ id: m.id }));
        if (models.length === 0) throw new ProviderRouteError("network_error", "Groq returned empty model list", 502);
        return { provider: "groq", configured: true, healthy: true, status: "healthy" as const, source: "live" as const, models };
      } catch (err) {
        // Do NOT treat /models 401 as invalid key — the same key may still work for chat.
        const models = [...GROQ_CATALOG].map((m) => ({ id: m.id }));
        return { provider: "groq", configured: true, healthy: false, status: "catalog_fallback" as const, source: "catalog_fallback" as const, models };
      }
    }, timeoutMs, configuredFromSource(keys.groqKey, process.env.GROQ_API_KEY))],
    ["openrouter", () => probeProviderModels("openrouter", Boolean(keys.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY), async () => {
      const orKey = keys.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY ?? "";
      const response = await fetchWithTimeout(fetchFn, "https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${orKey}` },
      }, 8_000);
      if (!response.ok) throw new ProviderRouteError(statusFromHttp(response.status), `OpenRouter ${response.status}: ${await safeResponseText(response)}`, response.status);
      const data = await response.json() as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map((m) => ({ id: m.id }));
      return { provider: "openrouter", configured: true, healthy: true, status: "healthy" as const, source: "live" as const, models };
    }, timeoutMs, configuredFromSource(keys.openrouterKey, process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY))],
    ["nvidia", () => probeProviderModels("nvidia", Boolean(keys.nvidiaKey ?? process.env.NVIDIA_API_KEY), async () => {
      const nvidiaKey = keys.nvidiaKey ?? process.env.NVIDIA_API_KEY;
      if (!nvidiaKey?.trim()) throw new ProviderRouteError("missing_key", "NVIDIA API key is not configured", 400);
      const response = await fetchWithTimeout(fetchFn, `${NVIDIA_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${nvidiaKey.trim()}` },
      }, 10_000);
      if (!response.ok) {
        const body = redactKnownSecret(await safeResponseText(response), nvidiaKey);
        throw new ProviderRouteError(statusFromHttp(response.status), `NVIDIA ${response.status}: ${body}`, response.status);
      }
      const liveModels = normalizeNvidiaModels(await response.json());
      const models = [...liveModels, ...NVIDIA_CATALOG].map((m) => ({ id: m.id }));
      return { provider: "nvidia", configured: true, healthy: true, status: "healthy" as const, source: "live" as const, models };
    }, timeoutMs, configuredFromSource(keys.nvidiaKey, process.env.NVIDIA_API_KEY))],
    ["github", () => probeProviderModels("github", Boolean(keys.githubToken ?? process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN), () => listGithubModels(keys.githubToken ?? process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN, fetchFn).catch(() => ({
      provider: "github", configured: true, healthy: false, status: "catalog_fallback" as const, source: "catalog_fallback" as const,
      models: GITHUB_MODELS_CATALOG.map((m) => ({ id: m.id })),
    })), timeoutMs, configuredFromSource(keys.githubToken, process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN))],
    ["cerebras", () => probeProviderModels("cerebras", Boolean(keys.cerebrasKey ?? process.env.CEREBRAS_API_KEY), () => listCerebrasModels(keys.cerebrasKey ?? process.env.CEREBRAS_API_KEY, fetchFn).catch(() => ({
      provider: "cerebras", configured: true, healthy: false, status: "catalog_fallback" as const, source: "catalog_fallback" as const,
      models: CEREBRAS_MODELS_CATALOG.map((m) => ({ id: m.id })),
    })), timeoutMs, configuredFromSource(keys.cerebrasKey, process.env.CEREBRAS_API_KEY))],
    ["gemini", () => probeProviderModels("gemini", Boolean(keys.geminiKey ?? process.env.GEMINI_API_KEY), async () => {
      const geminiKey = keys.geminiKey ?? process.env.GEMINI_API_KEY ?? "";
      if (!geminiKey) throw new ProviderRouteError("missing_key", "Gemini key missing", 400);
      const response = await fetchWithTimeout(fetchFn, "https://generativelanguage.googleapis.com/v1beta/openai/models", {
        headers: { Authorization: `Bearer ${geminiKey}` },
      }, 8_000);
      if (!response.ok) throw new ProviderRouteError(statusFromHttp(response.status), `Gemini ${response.status}: ${await safeResponseText(response)}`, response.status);
      const list = await response.json() as { data?: Array<{ id: string }> };
      const models = (list.data ?? []).map((m) => ({ id: m.id }));
      return { provider: "gemini", configured: true, healthy: true, status: "healthy" as const, source: "live" as const, models };
    }, timeoutMs, configuredFromSource(keys.geminiKey, process.env.GEMINI_API_KEY))],
    ["ollama", () => probeProviderModels("ollama", Boolean(keys.ollamaKey ?? process.env.OLLAMA_API_KEY), async () => {
      const ollamaKey = keys.ollamaKey ?? process.env.OLLAMA_API_KEY ?? "";
      if (!ollamaKey) throw new ProviderRouteError("missing_key", "Ollama key missing", 400);
      const list = await getOllamaClient(ollamaKey, keys.ollamaBase).models.list();
      const models = list.data.map((m) => ({ id: m.id }));
      return { provider: "ollama", configured: true, healthy: models.length > 0, status: models.length > 0 ? "healthy" as const : "network_error" as const, source: "live" as const, models };
    }, timeoutMs, configuredFromSource(keys.ollamaKey, process.env.OLLAMA_API_KEY))],
    ["tavily", () => probeSearchProviderStatus("tavily", keys, fetchFn, timeoutMs)],
    ["serper", () => probeSearchProviderStatus("serper", keys, fetchFn, timeoutMs)],
    ["exa", () => probeSearchProviderStatus("exa", keys, fetchFn, timeoutMs)],
    ["brave", () => probeSearchProviderStatus("brave", keys, fetchFn, timeoutMs)],
    ["firecrawl", () => probeSearchProviderStatus("firecrawl", keys, fetchFn, timeoutMs)],
    ["jina", () => probeSearchProviderStatus("jina", keys, fetchFn, timeoutMs)],
    ["scraperapi", () => probeSearchProviderStatus("scraperapi", keys, fetchFn, timeoutMs)],
    ["zenrows", () => probeSearchProviderStatus("zenrows", keys, fetchFn, timeoutMs)],
    ["scrapingbee", () => probeSearchProviderStatus("scrapingbee", keys, fetchFn, timeoutMs)],
    ["geekflare", () => probeSearchProviderStatus("geekflare", keys, fetchFn, timeoutMs)],
  ];
  const settled = await Promise.allSettled(checks.map(async ([provider, check]) => [provider, await check()] as const));
  const providers: ProviderStatusPayload["providers"] = {};
  for (const result of settled) {
    if (result.status === "fulfilled") {
      providers[result.value[0]] = result.value[1];
    }
  }
  const payload = { providers };
  debugProviderStatusPayload(payload);
  const ttl = statusCacheTtlMs(payload);
  if (ttl > 0) providerStatusCache.set(cacheKey, { expiresAt: now + ttl, payload });
  return payload;
}

async function probeSearchProviderStatus(provider: string, keys: RequestKeys, fetchFn: typeof fetch, timeoutMs: number): Promise<ProviderStatusPayload["providers"][string]> {
  const statuses = await buildSearchProviderStatus({
    tavily: keys.tavilyKey ?? process.env.TAVILY_API_KEY,
    serper: keys.serperKey ?? process.env.SERPER_API_KEY ?? process.env.SERPER_KEY,
    exa: keys.exaKey ?? process.env.EXA_API_KEY,
    brave: keys.braveKey ?? process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY,
    firecrawl: keys.firecrawlKey ?? process.env.FIRECRAWL_API_KEY,
    jina: keys.jinaKey ?? process.env.JINA_API_KEY ?? process.env.JINA_KEY,
    scraperapi: keys.scraperapiKey ?? process.env.SCRAPERAPI_KEY,
    zenrows: keys.zenrowsKey ?? process.env.ZENROWS_API_KEY,
    scrapingbee: keys.scrapingbeeKey ?? process.env.SCRAPINGBEE_API_KEY,
    geekflare: keys.geekflareKey ?? process.env.GEEKFLARE_API_KEY,
  }, {
    fetchFn,
    timeoutMs,
    configuredFrom: {
      tavily: configuredFromSource(keys.tavilyKey, process.env.TAVILY_API_KEY),
      serper: configuredFromSource(keys.serperKey, process.env.SERPER_API_KEY ?? process.env.SERPER_KEY),
      exa: configuredFromSource(keys.exaKey, process.env.EXA_API_KEY),
      brave: configuredFromSource(keys.braveKey, process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY),
      firecrawl: configuredFromSource(keys.firecrawlKey, process.env.FIRECRAWL_API_KEY),
      jina: configuredFromSource(keys.jinaKey, process.env.JINA_API_KEY ?? process.env.JINA_KEY),
      scraperapi: configuredFromSource(keys.scraperapiKey, process.env.SCRAPERAPI_KEY),
      zenrows: configuredFromSource(keys.zenrowsKey, process.env.ZENROWS_API_KEY),
      scrapingbee: configuredFromSource(keys.scrapingbeeKey, process.env.SCRAPINGBEE_API_KEY),
      geekflare: configuredFromSource(keys.geekflareKey, process.env.GEEKFLARE_API_KEY),
    },
  });
  const status = statuses[provider];
  if (!status) return { ...simpleKeyStatus(false), status: "status_unknown", configuredFrom: "none", canSearch: false, canExtract: false, chatVerified: false };
  return {
    configured: status.configured,
    healthy: status.healthy,
    status: status.status as ProviderRouteStatus,
    statusCode: statusFromErrorCode(status.status as ProviderRouteStatus),
    modelCount: 0,
    error: status.error,
    latencyMs: status.latencyMs,
    configuredFrom: status.configuredFrom,
    canChat: false,
    chatVerified: false,
    canListModels: false,
    liveModelListVerified: false,
    catalogFallbackOnly: false,
    canSearch: status.canSearch,
    canExtract: status.canExtract,
  };
}

router.get("/providers/status", async (req, res) => {
  const keys = extractKeys(req);
  const bypassCache = req.query.bypass === "true" || req.query.refresh !== undefined;
  const payload = await buildProviderStatusPayload(keys, { bypassCache });
  if (bypassCache) {
    emitProviderStatusLogs(payload, { configuredOnly: true });
  }
  res.json(payload);
});

router.post("/providers/diagnostics", async (req, res) => {
  const keys = extractKeys(req);
  const payload = await buildProviderStatusPayload(keys, { bypassCache: true });
  emitProviderStatusLogs(payload);
  res.json({ diagnostics: payload.providers });
});

router.get("/gemini/status", async (req, res) => {
  const keys = extractKeys(req);
  const key = keys.geminiKey ?? process.env.GEMINI_API_KEY ?? "";
  if (!key) return res.json({ status: "not_configured" });
  try {
    await getGeminiClient(key).models.list();
    res.json({ status: "ok" });
  } catch (err: any) {
    res.json({ status: "error", message: safeMessage(err, "Unknown error") });
  }
});

router.get("/tavily/status", async (req, res) => {
  const keys = extractKeys(req);
  const key = keys.tavilyKey ?? process.env.TAVILY_API_KEY ?? "";
  if (!key) return res.json({ status: "not_configured", message: "No Tavily API key set" });
  try {
    await tavily({ apiKey: key }).search("test", { maxResults: 1 });
    res.json({ status: "ok", message: "Tavily key is valid" });
  } catch (err: any) {
    const msg = safeMessage(err, "Unknown error");
    res.json({ status: "error", message: msg.includes("401") ? "Invalid API key" : msg });
  }
});

class ProviderRouteError extends Error {
  constructor(public readonly code: ProviderRouteStatus, message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "ProviderRouteError";
  }
}

async function probeProviderModels(
  provider: string,
  configured: boolean,
  fn: () => Promise<ProviderModelListPayload | { provider?: string; configured?: boolean; healthy?: boolean; status?: ProviderRouteStatus; source: ProviderModelListPayload["source"]; models: Array<{ id: string }>; canChat?: boolean; chatVerified?: boolean; canListModels?: boolean }>,
  timeoutMs = 8_000,
  configuredFrom?: "browser" | "server_env" | "none",
): Promise<ProviderStatusPayload["providers"][string]> {
  if (!configured) return { ...simpleKeyStatus(false), configuredFrom: configuredFrom ?? "none", canChat: false, chatVerified: false, canListModels: false };
  const started = Date.now();
  try {
    const payload = await withProviderTimeout(fn(), timeoutMs, provider);
    const modelCount = payload.models.length;
    const status = payload.status ?? (payload.source === "catalog_fallback" ? "catalog_fallback" : "network_error");
    const policy = deriveProviderHealthPolicy({
      configured: true,
      healthy: payload.healthy === true && modelCount > 0,
      status,
      source: payload.source,
      modelCount,
      canChat: (payload as any).canChat,
      chatVerified: (payload as any).chatVerified,
      canListModels: (payload as any).canListModels,
    });
    return {
      configured: true,
      healthy: policy.healthy,
      status,
      statusCode: (payload as any).statusCode ?? statusFromErrorCode(status),
      source: payload.source,
      modelCount,
      models: payload.models.map((model) => model.id),
      error: policy.healthy ? undefined : "error" in payload ? payload.error : undefined,
      latencyMs: Date.now() - started,
      configuredFrom: configuredFrom ?? "browser",
      canChat: policy.canChat,
      chatVerified: policy.chatVerified,
      canListModels: policy.canListModels,
      liveModelListVerified: policy.liveModelListVerified,
      catalogFallbackOnly: policy.catalogFallbackOnly,
      recentlyFailed: policy.recentlyFailed,
      rateLimited: policy.rateLimited,
      invalidModel: policy.invalidModel,
    };
  } catch (err) {
    const status = statusCodeFromError(err);
    return {
      configured: true,
      healthy: false,
      status,
      statusCode: statusFromError(err),
      modelCount: 0,
      error: safeMessage(err, `${provider} provider check failed`),
      latencyMs: Date.now() - started,
      configuredFrom: configuredFrom ?? "browser",
      canChat: false,
      chatVerified: false,
      canListModels: false,
      liveModelListVerified: false,
      catalogFallbackOnly: false,
      recentlyFailed: true,
      rateLimited: status === "rate_limited",
      invalidModel: status === "invalid_model",
    };
  }
}

function simpleKeyStatus(configured: boolean): ProviderStatusPayload["providers"][string] {
  const status = configured ? "unverified" : "missing_key";
  return { configured, healthy: false, status, statusCode: statusFromErrorCode(status), modelCount: 0, configuredFrom: configured ? "browser" : "none", canChat: false, chatVerified: false, canListModels: false, liveModelListVerified: false, catalogFallbackOnly: false, recentlyFailed: false, rateLimited: false, invalidModel: false };
}

export function providerRouteErrorPayload(provider: string, status: ProviderRouteStatus, error: string, configured: boolean, latencyMs?: number): Record<string, unknown> {
  return {
    provider,
    configured,
    healthy: false,
    status,
    statusCode: statusFromErrorCode(status),
    source: status === "catalog_fallback" ? "catalog_fallback" : "live",
    models: [],
    modelCount: 0,
    error: redactSecretString(error),
    canChat: false,
    chatVerified: false,
    canListModels: false,
    liveModelListVerified: false,
    catalogFallbackOnly: status === "catalog_fallback",
    recentlyFailed: status !== "missing_key" && status !== "unverified",
    rateLimited: status === "rate_limited",
    invalidModel: status === "invalid_model",
    ...(latencyMs === undefined ? {} : { latencyMs }),
  };
}

export function httpStatusForProviderStatus(status: ProviderRouteStatus): number {
  return modelRouteHttpStatusForProviderStatus(status);
}

export function sendProviderStatusPayload(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  payload: ProviderModelListPayload | Record<string, unknown>,
  options: { serverError?: boolean } = {},
): void {
  if (options.serverError) {
    res.status(500).json(payload);
    return;
  }
  const status = typeof payload.status === "string" ? payload.status as ProviderRouteStatus : "unavailable";
  res.status(httpStatusForProviderStatus(status)).json(normalizeProviderModelRoutePayload(payload as any));
}

function sendProviderModelPayload(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  payload: ProviderModelListPayload | Record<string, unknown>,
): void {
  const normalized = normalizeProviderModelRoutePayload(payload as any);
  logProviderCall({
    event: "provider_model_route_status",
    providerName: String((payload as any).provider ?? "unknown"),
    providerKind: "model_route",
    operation: "list_models",
    statusCode: normalized.statusCode,
    latencyMs: normalized.latencyMs ?? null,
    configured: normalized.configured,
    healthy: normalized.healthy,
    canChat: normalized.canChat,
    chatVerified: normalized.chatVerified,
    canListModels: normalized.canListModels,
    catalogFallbackOnly: normalized.catalogFallbackOnly,
    modelCount: normalized.modelCount,
    source: normalized.source,
    errorCode: normalized.status === "healthy" ? null : normalized.status,
    success: normalized.status === "healthy",
  });
  sendProviderStatusPayload(res, payload);
}

export function fingerprint(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function statusCacheKey(keys: RequestKeys): string {
  const segments: Array<[string, string]> = [
    ["groq", keys.groqKey ?? process.env.GROQ_API_KEY ?? ""],
    ["openrouter", keys.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY ?? ""],
    ["nvidia", keys.nvidiaKey ?? process.env.NVIDIA_API_KEY ?? ""],
    ["github", keys.githubToken ?? process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? ""],
    ["cerebras", keys.cerebrasKey ?? process.env.CEREBRAS_API_KEY ?? ""],
    ["gemini", keys.geminiKey ?? process.env.GEMINI_API_KEY ?? ""],
    ["tavily", keys.tavilyKey ?? process.env.TAVILY_API_KEY ?? ""],
    ["jina", keys.jinaKey ?? process.env.JINA_API_KEY ?? process.env.JINA_KEY ?? ""],
    ["brave", keys.braveKey ?? process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY ?? ""],
    ["serper", keys.serperKey ?? process.env.SERPER_API_KEY ?? process.env.SERPER_KEY ?? ""],
    ["exa", keys.exaKey ?? process.env.EXA_API_KEY ?? ""],
    ["firecrawl", keys.firecrawlKey ?? process.env.FIRECRAWL_API_KEY ?? ""],
    ["scraperapi", keys.scraperapiKey ?? process.env.SCRAPERAPI_KEY ?? ""],
    ["zenrows", keys.zenrowsKey ?? process.env.ZENROWS_API_KEY ?? ""],
    ["scrapingbee", keys.scrapingbeeKey ?? process.env.SCRAPINGBEE_API_KEY ?? ""],
    ["geekflare", keys.geekflareKey ?? process.env.GEEKFLARE_API_KEY ?? ""],
    ["ollama", keys.ollamaKey ?? process.env.OLLAMA_API_KEY ?? ""],
    ["ollamaBase", keys.ollamaBase ?? ""],
  ];
  return segments.map(([provider, value]) => `${provider}:${value ? fingerprint(value) : "none"}`).join("|");
}

function statusCacheTtlMs(payload: ProviderStatusPayload): number {
  const ttls = Object.values(payload.providers).map((provider) => {
    if (provider.status === "healthy" || provider.status === "missing_key") return 30_000;
    if (provider.status === "checking") return 0;
    return 10_000;
  });
  return ttls.length ? Math.min(...ttls) : 0;
}

function resolveProviderStatusTimeoutMs(explicitTimeoutMs?: number): number {
  if (Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs! > 0) return Math.floor(explicitTimeoutMs!);
  const raw = process.env.PROVIDER_STATUS_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 8_000;
}

function debugProviderStatusPayload(payload: ProviderStatusPayload): void {
  if (process.env.DEBUG_PROVIDERS !== "true" && process.env.VITE_DEBUG_PROVIDERS !== "true") return;
  for (const [provider, status] of Object.entries(payload.providers)) {
    console.info("[BestDel providers]", {
      provider,
      status: status.status,
      healthy: status.healthy,
      configured: status.configured,
      modelCount: status.modelCount,
      latencyMs: status.latencyMs,
      error: status.error,
    });
  }
}

export function emitProviderStatusLogs(
  payload: ProviderStatusPayload,
  options: { configuredOnly?: boolean } = {},
): void {
  for (const [providerName, status] of Object.entries(payload.providers)) {
    if (options.configuredOnly && !status.configured) continue;
    logDiagnosticStatus(providerName, status);
  }
}

function logDiagnosticStatus(providerName: string, status: ProviderStatusEntry): void {
  logProviderCall({
    event: "provider_diagnostic",
    providerName,
    providerKind: status.canSearch || status.canExtract
      ? status.canExtract && !status.canSearch ? "extraction" : "search"
      : "generation",
    operation: status.canSearch || status.canExtract ? "health_check" : "model_status",
    statusCode: status.statusCode ?? statusFromErrorCode(status.status),
    latencyMs: status.latencyMs ?? null,
    configured: status.configured,
    configuredFrom: status.configuredFrom,
    healthy: status.healthy,
    canListModels: status.canListModels,
    canChat: status.canChat,
    chatVerified: status.chatVerified,
    catalogFallbackOnly: status.catalogFallbackOnly,
    modelCount: status.modelCount,
    source: status.source,
    errorCode: status.status === "healthy" ? null : status.status,
    success: status.healthy,
  });
}

function statusCodeFromError(err: unknown): "invalid_key" | "billing_credits" | "invalid_model" | "rate_limited" | "network_error" | "timeout" {
  if (err instanceof ProviderRouteError) {
    if (err.code === "invalid_key" || err.code === "billing_credits" || err.code === "invalid_model" || err.code === "rate_limited" || err.code === "network_error" || err.code === "timeout") return err.code;
  }
  const text = safeMessage(err, "").toLowerCase();
  if (/402|insufficient credits|billing credits|credit balance|payment required/.test(text)) return "billing_credits";
  if (/404|model.*not found|provider.*not found|unknown model|no endpoints found/.test(text)) return "invalid_model";
  if (/abort|timeout|timed out/.test(text)) return "timeout";
  if (/401|403|unauthorized|forbidden/i.test(text)) return "invalid_key";
  if (/429|rate/.test(text)) return "rate_limited";
  return "network_error";
}

function statusFromHttp(status: number): ProviderRouteStatus {
  if (status === 404) return "invalid_model";
  if (status === 402) return "billing_credits";
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  return "network_error";
}

function statusFromError(err: unknown): number {
  if (err instanceof ProviderRouteError && Number.isFinite(err.statusCode)) return err.statusCode;
  const status = statusCodeFromError(err);
  if (status === "invalid_model") return 404;
  if (status === "billing_credits") return 402;
  if (status === "invalid_key") return 401;
  if (status === "rate_limited") return 429;
  return 502;
}

function statusFromErrorCode(status: ProviderRouteStatus): number {
  if (status === "healthy") return 200;
  if (status === "catalog_fallback" || status === "unverified") return 206;
  if (status === "missing_key") return 401;
  if (status === "invalid_key") return 401;
  if (status === "billing_credits") return 402;
  if (status === "invalid_model") return 404;
  if (status === "rate_limited") return 429;
  if (status === "timeout") return 504;
  return 502;
}

function safeMessage(err: unknown, fallback: string): string {
  return redactSecretString(err instanceof Error ? err.message : String(err || fallback));
}

function redactKnownSecret(message: string, secret: string | null | undefined): string {
  const trimmed = secret?.trim();
  if (!trimmed) return message;
  return message.split(trimmed).join("[REDACTED_SECRET]");
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return redactSecretString((await response.text()).slice(0, 1000));
  } catch {
    return "";
  }
}

async function fetchWithTimeout(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function withProviderTimeout<T>(promise: Promise<T>, timeoutMs: number, provider: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new ProviderRouteError("timeout", `${provider} provider check timed out`, 504)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function validateGithubModelsToken(token: string, fetchFn: typeof fetch): Promise<void> {
  const baseUrl = (process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference").replace(/\/$/, "");
  const response = await fetchWithTimeout(fetchFn, `${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
      "X-GitHub-Models-Api-Key": token.trim(),
      "X-GitHub-Token": token.trim(),
    },
    body: JSON.stringify({
      model: "openai/gpt-4.1-mini",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0,
    }),
  }, 8_000);
  if (!response.ok) {
    throw new ProviderRouteError(statusFromHttp(response.status), `GitHub Models validation returned ${response.status}: ${await safeResponseText(response)}`, response.status);
  }
}

function readableModelName(id: string): string {
  const last = id.split("/").pop() ?? id;
  if (/kimi-k2\.6/i.test(id)) return "Kimi K2.6";
  if (/nemotron-ultra/i.test(id)) return "Nemotron Ultra";
  if (/nemotron-super/i.test(id)) return "Nemotron Super";
  return last.split(/[-_]/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function badgeForNvidiaModel(id: string): string | undefined {
  if (/kimi|moonshot/i.test(id)) return "agentic";
  if (/ultra/i.test(id)) return "ultra";
  if (/super/i.test(id)) return "flagship";
  if (/nano|8b/i.test(id)) return "fast";
  if (/qwen|deepseek/i.test(id)) return "reason";
  return undefined;
}

function badgeForCerebrasModel(id: string): string | undefined {
  if (/70b/i.test(id)) return "flagship";
  if (/8b/i.test(id)) return "fast";
  return undefined;
}

function ownedByFromId(id: string): string {
  return id.includes("/") ? id.split("/")[0] : "nvidia";
}

function dedupeModels(models: ProviderModelListItem[]): ProviderModelListItem[] {
  const byId = new Map<string, ProviderModelListItem>();
  for (const model of models) {
    if (!model.id) continue;
    if (!byId.has(model.id)) byId.set(model.id, model);
  }
  return [...byId.values()];
}

function sortModels(a: { id: string }, b: { id: string }): number {
  const rank = (id: string) =>
    /kimi-k2\.6/i.test(id) ? 0
      : /nemotron-ultra/i.test(id) ? 1
      : /nemotron-super/i.test(id) ? 2
      : /llama3\.3-70b/i.test(id) ? 3
      : /llama3\.1-8b/i.test(id) ? 4
      : 10;
  return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
}

export default router;
