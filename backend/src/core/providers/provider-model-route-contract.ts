import { deriveProviderHealthPolicy } from "./provider-health-policy.js";
import type { ProviderRouteStatus } from "./provider-status-contract.js";

export interface ProviderModelRoutePayload {
  status?: ProviderRouteStatus;
  statusCode?: number;
  healthy?: boolean;
  source?: "live" | "catalog_fallback";
  models?: unknown[];
  modelCount?: number;
  canChat?: boolean;
  chatVerified?: boolean;
  canListModels?: boolean;
  liveModelListVerified?: boolean;
  catalogFallbackOnly?: boolean;
  recentlyFailed?: boolean;
  rateLimited?: boolean;
  invalidModel?: boolean;
  configured?: boolean;
  [key: string]: unknown;
}

export function httpStatusForProviderStatus(status: ProviderRouteStatus): number {
  if (status === "checking") return 202;
  if (status === "missing_key") return 401;
  if (status === "invalid_key") return 401;
  if (status === "billing_credits") return 402;
  if (status === "invalid_model") return 404;
  if (status === "rate_limited") return 429;
  if (status === "network_error" || status === "timeout") return 502;
  if (status === "unavailable" || status === "status_unknown") return 503;
  if (status === "catalog_fallback" || status === "unverified") return 206;
  return 200;
}

export function normalizeProviderModelRoutePayload<T extends ProviderModelRoutePayload>(payload: T): T & {
  modelCount: number;
  healthy: boolean;
  canChat: boolean;
  chatVerified: boolean;
  canListModels: boolean;
  liveModelListVerified: boolean;
  catalogFallbackOnly: boolean;
  recentlyFailed: boolean;
  rateLimited: boolean;
  invalidModel: boolean;
} {
  const status = typeof payload.status === "string" ? payload.status : "unavailable";
  const models = Array.isArray(payload.models) ? payload.models : [];
  const modelCount = typeof payload.modelCount === "number" ? payload.modelCount : models.length;
  const policy = deriveProviderHealthPolicy({
    configured: payload.configured === true,
    healthy: payload.healthy === true,
    status,
    source: payload.source,
    modelCount,
    canChat: payload.canChat,
    chatVerified: payload.chatVerified,
    canListModels: payload.canListModels,
  });

  return {
    ...payload,
    statusCode: typeof payload.statusCode === "number" ? payload.statusCode : httpStatusForProviderStatus(status),
    modelCount,
    healthy: policy.healthy,
    canChat: policy.canChat,
    chatVerified: policy.chatVerified,
    canListModels: policy.canListModels,
    liveModelListVerified: policy.liveModelListVerified,
    catalogFallbackOnly: policy.catalogFallbackOnly,
    recentlyFailed: policy.recentlyFailed,
    rateLimited: policy.rateLimited,
    invalidModel: policy.invalidModel,
  };
}
