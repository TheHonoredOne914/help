import type { ModelProviderName, ProviderModel, ProviderModels, ProviderStatusMap } from "./provider-types";
import { MODEL_PROVIDERS } from "./provider-types";
import { isProviderSelectableForUser } from "./provider-status-normalizer";

export function extractRawModels(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const payload = isRecord(raw) ? raw : {};
  const candidates = [
    payload.models,
    payload.data,
    payload.items,
    isRecord(payload.models) ? payload.models.data : undefined,
    isRecord(payload.models) ? payload.models.items : undefined,
    isRecord(payload.data) ? payload.data.data : undefined,
    isRecord(payload.data) ? payload.data.models : undefined,
    isRecord(payload.result) ? payload.result.models : undefined,
    isRecord(payload.result) ? payload.result.data : undefined,
    isRecord(payload.payload) ? payload.payload.models : undefined,
    isRecord(payload.payload) ? payload.payload.data : undefined,
  ];
  return candidates.find((candidate) => Array.isArray(candidate)) as unknown[] ?? [];
}

export function normalizeProviderModels(provider: ModelProviderName, raw: unknown): ProviderModel[] {
  const seen = new Set<string>();
  const models: ProviderModel[] = [];

  for (const rawModel of extractRawModels(raw)) {
    const model = normalizeProviderModel(provider, rawModel);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }

  return models;
}

export function normalizeProviderModel(provider: ModelProviderName, rawModel: unknown): ProviderModel | null {
  if (typeof rawModel === "string") {
    const id = normalizeProviderNativeModelId(provider, rawModel);
    return id ? { id } : null;
  }
  if (!isRecord(rawModel)) return null;
  const id = normalizeProviderNativeModelId(provider, String(rawModel.id ?? rawModel.name ?? ""));
  if (!id) return null;
  return {
    id,
    name: typeof rawModel.name === "string" ? rawModel.name : undefined,
    ownedBy: typeof rawModel.ownedBy === "string" ? rawModel.ownedBy : typeof rawModel.owned_by === "string" ? rawModel.owned_by : undefined,
    badge: typeof rawModel.badge === "string" ? rawModel.badge : undefined,
    contextWindow: typeof rawModel.contextWindow === "number" ? rawModel.contextWindow : typeof rawModel.context_length === "number" ? rawModel.context_length : undefined,
  };
}

export function normalizeProviderNativeModelId(provider: ModelProviderName, id: string): string {
  const trimmed = id.trim();
  const providerPrefix = `${provider}/`;
  if (provider === "nvidia") {
    // NVIDIA native model ids can themselves start with "nvidia/".
    // Only remove the outer app-level provider prefix from already-prefixed
    // ids like "nvidia/nvidia/llama-..."; keep native ids intact.
    return trimmed.startsWith("nvidia/nvidia/") ? trimmed.slice(providerPrefix.length) : trimmed;
  }
  if (trimmed.startsWith(providerPrefix)) {
    return trimmed.slice(providerPrefix.length);
  }
  return trimmed;
}

export function toProviderModelId(provider: ModelProviderName, modelId: string): string {
  const nativeId = normalizeProviderNativeModelId(provider, modelId);
  return nativeId ? `${provider}/${nativeId}` : "";
}

export function buildHealthyResearchModels(providerStatus: ProviderStatusMap, providerModels: ProviderModels): string[] {
  return buildSelectableResearchModels(providerStatus, providerModels);
}

export function buildSelectableResearchModels(providerStatus: ProviderStatusMap, providerModels: ProviderModels): string[] {
  return MODEL_PROVIDERS.flatMap((provider) => {
    const status = providerStatus[provider];
    const models = providerModels[provider] ?? [];
    if (!status || models.length === 0) return [];
    if (!isProviderSelectableForUser(status, models)) return [];
    return models.map((model) => toProviderModelId(provider, model.id)).filter(Boolean);
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object";
}
