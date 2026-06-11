export type ProviderRouteStatus =
  | "healthy"
  | "missing_key"
  | "invalid_key"
  | "billing_credits"
  | "rate_limited"
  | "invalid_model"
  | "network_error"
  | "timeout"
  | "catalog_fallback"
  | "unverified"
  | "checking"
  | "unavailable"
  | "status_unknown";

export interface ProviderStatusContract {
  configured: boolean;
  healthy: boolean;
  status: ProviderRouteStatus;
  statusCode?: number;
  source?: "live" | "catalog_fallback";
  modelCount?: number;
  models?: string[];
  error?: string;
  latencyMs?: number;
  configuredFrom?: "browser" | "server_env" | "none";
  canChat?: boolean;
  chatVerified?: boolean;
  canListModels?: boolean;
  liveModelListVerified?: boolean;
  catalogFallbackOnly?: boolean;
  recentlyFailed?: boolean;
  rateLimited?: boolean;
  invalidModel?: boolean;
  canSearch?: boolean;
  canExtract?: boolean;
}

export function isUsableProviderStatus(status: ProviderRouteStatus): boolean {
  return status === "healthy";
}
