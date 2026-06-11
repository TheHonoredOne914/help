interface ProviderSelectionStatus {
  configured?: boolean;
  status?: string;
  catalogFallbackOnly?: boolean;
  modelCount?: number;
}

interface RepairContext {
  providerStatusByName?: Record<string, ProviderSelectionStatus | undefined>;
}

export function preferredModel(healthyResearchModels: string[]): string | null {
  return healthyResearchModels[0] ?? null;
}

export function repairSelectedModel(
  selectedModel: string,
  healthyResearchModels: string[],
  context: RepairContext = {},
): string | null {
  if (healthyResearchModels.includes(selectedModel)) return selectedModel;
  if (isUserSelectedProviderStillAllowed(selectedModel, context)) return selectedModel;
  if (healthyResearchModels.length === 0) return null;
  return preferredModel(healthyResearchModels);
}

export function repairSelectedModelList(
  selectedModels: string[],
  healthyResearchModels: string[],
  context: RepairContext = {},
): string[] {
  if (healthyResearchModels.length === 0) {
    return selectedModels;
  }
  const usable = new Set(healthyResearchModels);
  const kept = Array.from(new Set(selectedModels.filter((model) => usable.has(model) || isUserSelectedProviderStillAllowed(model, context))));
  if (kept.length > 0) return kept;
  const fallback = preferredModel(healthyResearchModels);
  return fallback ? [fallback] : [];
}

function isUserSelectedProviderStillAllowed(model: string, context: RepairContext): boolean {
  const provider = providerFromModel(model);
  if (!provider) return false;
  const status = context.providerStatusByName?.[provider];
  if (!status?.configured) return false;
  return !isExplicitlyInvalid(status.status);
}

function providerFromModel(model: string): string | null {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : null;
}

function isExplicitlyInvalid(status: string | undefined): boolean {
  return status === "missing_key"
    || status === "invalid_key"
    || status === "rate_limited"
    || status === "unavailable";
}
