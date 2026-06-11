import type { ProviderRouteStatus } from "./provider-status-contract.js";

export interface ProviderHealthPolicyInput {
  configured: boolean;
  healthy?: boolean;
  status?: ProviderRouteStatus;
  source?: "live" | "catalog_fallback";
  modelCount?: number;
  canChat?: boolean;
  chatVerified?: boolean;
  canListModels?: boolean;
  providerStatusesSupplied?: boolean;
}

export interface ProviderHealthPolicy {
  healthy: boolean;
  canChat: boolean;
  chatVerified: boolean;
  canListModels: boolean;
  liveModelListVerified: boolean;
  catalogFallbackOnly: boolean;
  recentlyFailed: boolean;
  rateLimited: boolean;
  invalidModel: boolean;
}

export function deriveProviderHealthPolicy(input: ProviderHealthPolicyInput): ProviderHealthPolicy {
  const status = input.status ?? (input.source === "catalog_fallback" ? "catalog_fallback" : "status_unknown");
  const hasModels = (input.modelCount ?? 0) > 0;
  const catalogFallbackOnly = input.source === "catalog_fallback" || status === "catalog_fallback";
  const rateLimited = status === "rate_limited";
  const invalidModel = status === "invalid_model";
  const recentlyFailed = ["rate_limited", "invalid_model", "network_error", "timeout", "unavailable", "invalid_key", "billing_credits"].includes(status);
  const liveModelListVerified = input.configured && status === "healthy" && input.source !== "catalog_fallback" && hasModels;
  const healthy = Boolean(input.configured && input.healthy === true && status === "healthy");
  const defaultCanChat = healthy && !catalogFallbackOnly;
  const defaultCanListModels = hasModels && (status === "healthy" || status === "catalog_fallback" || status === "unverified");
  const canChat = Boolean(
    input.configured
      && status === "healthy"
      && !catalogFallbackOnly
      && (input.canChat ?? defaultCanChat) === true,
  );
  const chatVerified = Boolean(
    input.configured
      && status === "healthy"
      && !catalogFallbackOnly
      && (input.chatVerified ?? canChat) === true,
  );

  return {
    healthy,
    canChat,
    chatVerified,
    canListModels: input.canListModels ?? defaultCanListModels,
    liveModelListVerified,
    catalogFallbackOnly,
    recentlyFailed,
    rateLimited,
    invalidModel,
  };
}
