import type { ProviderName } from "./provider-types.js";

export interface ProviderResearchStatus {
  providerName: ProviderName;
  configured: boolean;
  status?: "healthy" | "missing_key" | "invalid_key" | "billing_credits" | "invalid_model" | "rate_limited" | "network_error" | "catalog_fallback" | "unverified" | "unavailable" | "status_unknown";
  modelEndpointStatus?: number;
  healthy?: boolean;
  canChat?: boolean;
  chatVerified?: boolean;
  canListModels?: boolean;
  liveModelListVerified?: boolean;
  catalogFallbackOnly?: boolean;
  recentlyFailed?: boolean;
  rateLimited?: boolean;
  invalidModel?: boolean;
  models?: string[];
  supportsJsonTasks?: boolean;
  error?: string;
}

export interface ProviderHealthCandidate {
  providerName: ProviderName;
  model: string;
}

export interface ProviderHealthSummary {
  healthyProviders: ProviderHealthCandidate[];
  unhealthyProviders: Array<ProviderResearchStatus & { reason: string }>;
  selectedProvider: ProviderName | null;
  selectedModel: string | null;
  errors: string[];
}

export function getHealthyProvidersForResearch(input: {
  selectedProvider?: ProviderName;
  selectedModel?: string;
  fallbackModels?: ProviderHealthCandidate[];
  providerStatuses?: ProviderResearchStatus[];
  autoFallback?: boolean;
  trustRegisteredProvidersWithoutStatus?: boolean;
}): ProviderHealthSummary {
  const candidates = uniqueCandidates([
    ...(input.selectedProvider && input.selectedModel ? [{ providerName: input.selectedProvider, model: input.selectedModel }] : []),
    ...(input.fallbackModels ?? []),
  ]);
  const statusByProvider = new Map((input.providerStatuses ?? []).map((status) => [status.providerName, status]));
  const unhealthyProviders: Array<ProviderResearchStatus & { reason: string }> = [];
  const healthyProviders: ProviderHealthCandidate[] = [];
  const errors: string[] = [];

  for (const candidate of candidates) {
    const status = statusByProvider.get(candidate.providerName);
    if (!status) {
      const isSelected = candidate.providerName === input.selectedProvider && candidate.model === input.selectedModel;
      const canTrustMissingStatus = isSelected
        && input.trustRegisteredProvidersWithoutStatus === true
        && input.providerStatuses === undefined;
      if (canTrustMissingStatus) {
        healthyProviders.push(candidate);
        errors.push(`${candidate.providerName}: status_unknown_assumed_registered`);
        continue;
      }
      const unknown: ProviderResearchStatus & { reason: string } = {
        providerName: candidate.providerName,
        configured: false,
        status: "status_unknown",
        reason: "status_unknown_assumed_unhealthy",
      };
      unhealthyProviders.push(unknown);
      errors.push(`${candidate.providerName}: status_unknown_assumed_unhealthy`);
      continue;
    }
    const isSelected = candidate.providerName === input.selectedProvider && candidate.model === input.selectedModel;
    const reason = unhealthyReason(status, candidate.model, {
      isSelected,
      autoFallback: input.autoFallback === true,
    });
    if (reason) {
      unhealthyProviders.push({ ...status, reason });
      if (status.error) errors.push(`${candidate.providerName}: ${status.error}`);
      continue;
    }
    healthyProviders.push(candidate);
  }

  for (const status of input.providerStatuses ?? []) {
    if (candidates.some((candidate) => candidate.providerName === status.providerName)) continue;
    const reason = unhealthyReason(status, undefined, { isSelected: false, autoFallback: input.autoFallback === true });
    if (reason) {
      unhealthyProviders.push({ ...status, reason });
      if (status.error) errors.push(`${status.providerName}: ${status.error}`);
    }
  }

  if (healthyProviders.length === 0) {
    errors.unshift("No healthy research provider is configured for JSON source-usage tasks.");
  }

  return {
    healthyProviders,
    unhealthyProviders: dedupeUnhealthy(unhealthyProviders),
    selectedProvider: healthyProviders[0]?.providerName ?? null,
    selectedModel: healthyProviders[0]?.model ?? null,
    errors,
  };
}

function unhealthyReason(
  status: ProviderResearchStatus,
  model?: string,
  options: { isSelected: boolean; autoFallback: boolean } = { isSelected: false, autoFallback: false },
): string | null {
  if (!status.configured) return "not_configured";
  const explicitBadStatuses = new Set(["missing_key", "invalid_key", "billing_credits", "invalid_model", "rate_limited", "network_error", "timeout", "unavailable"]);
  if (status.status && explicitBadStatuses.has(status.status)) return status.status;
  if (typeof status.modelEndpointStatus === "number" && status.modelEndpointStatus >= 400) return "model_endpoint_unhealthy";
  if (model && status.models && status.models.length > 0 && !status.models.includes(model)) return "model_not_available";
  if (options.isSelected && !options.autoFallback) {
    return null;
  }
  if (status.chatVerified !== true) return status.catalogFallbackOnly ? "catalog_fallback_only" : "chat_not_verified";
  if (status.status && status.status !== "healthy") return status.status;
  if (status.healthy === false) return "marked_unhealthy";
  if (status.supportsJsonTasks === false) return "json_tasks_unsupported";
  return null;
}

function uniqueCandidates(candidates: ProviderHealthCandidate[]): ProviderHealthCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.providerName}/${candidate.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeUnhealthy(items: Array<ProviderResearchStatus & { reason: string }>): Array<ProviderResearchStatus & { reason: string }> {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.providerName}/${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
