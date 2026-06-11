import type { ModelProviderName, ProviderModel, ProviderName, ProviderRuntimeStatus, ProviderRuntimeStatusValue } from "./provider-types";

const KNOWN_STATUS_VALUES = new Set<ProviderRuntimeStatusValue>([
  "missing_key",
  "checking",
  "healthy",
  "invalid_key",
  "billing_credits",
  "rate_limited",
  "network_error",
  "timeout",
  "catalog_fallback",
  "unverified",
  "unavailable",
  "status_unknown",
]);

export function missingStatus(provider: ProviderName): ProviderRuntimeStatus {
  return { provider, configured: false, healthy: false, checking: false, status: "missing_key", modelCount: 0 };
}

export function normalizeProviderStatus(provider: ProviderName, raw: unknown): ProviderRuntimeStatus {
  const payload = isRecord(raw) ? raw : {};
  const configured = Boolean(payload.configured);
  const rawStatus = typeof payload.status === "string" && KNOWN_STATUS_VALUES.has(payload.status as ProviderRuntimeStatusValue)
    ? payload.status as ProviderRuntimeStatusValue
    : configured ? "unavailable" : "missing_key";
  const healthy = payload.healthy === true;

  return {
    provider,
    configured,
    healthy,
    checking: false,
    status: rawStatus,
    modelCount: Number(payload.modelCount ?? arrayLength(payload.models) ?? 0),
    latencyMs: typeof payload.latencyMs === "number" ? payload.latencyMs : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
    source: payload.source === "live" || payload.source === "catalog_fallback" ? payload.source : undefined,
    configuredFrom: payload.configuredFrom === "browser" || payload.configuredFrom === "server_env" || payload.configuredFrom === "none"
      ? payload.configuredFrom
      : undefined,
    canChat: typeof payload.canChat === "boolean" ? payload.canChat : undefined,
    chatVerified: typeof payload.chatVerified === "boolean" ? payload.chatVerified : undefined,
    canListModels: typeof payload.canListModels === "boolean" ? payload.canListModels : undefined,
    liveModelListVerified: typeof payload.liveModelListVerified === "boolean" ? payload.liveModelListVerified : undefined,
    catalogFallbackOnly: typeof payload.catalogFallbackOnly === "boolean" ? payload.catalogFallbackOnly : undefined,
    canSearch: typeof payload.canSearch === "boolean" ? payload.canSearch : undefined,
    canExtract: typeof payload.canExtract === "boolean" ? payload.canExtract : undefined,
  };
}

export function failedConfiguredStatus(provider: ProviderName, message: string): ProviderRuntimeStatus {
  return {
    provider,
    configured: true,
    healthy: false,
    checking: false,
    status: "network_error",
    modelCount: 0,
    error: message,
  };
}

export function isProviderDisplayable(status: ProviderRuntimeStatus, models: ProviderModel[]): boolean {
  if (models.length === 0) return false;
  return status.healthy === true
    || status.canListModels === true
    || status.source === "catalog_fallback"
    || status.status === "catalog_fallback"
    || status.status === "unverified";
}

export function isProviderResearchUsable(status: ProviderRuntimeStatus): boolean {
  return isProviderChatVerifiedForAutoUse(status);
}

export function isProviderSelectableForUser(status: ProviderRuntimeStatus, models: ProviderModel[] = []): boolean {
  if (models.length === 0) return false;
  if (!status.configured) return false;
  return !isExplicitlyUnavailableForUser(status);
}

export function isProviderChatVerifiedForAutoUse(status: ProviderRuntimeStatus): boolean {
  return status.configured === true
    && status.healthy === true
    && status.chatVerified === true
    && status.catalogFallbackOnly !== true
    && status.source !== "catalog_fallback"
    && status.status === "healthy";
}

export function deriveStatusFromModelRoute(
  provider: ModelProviderName,
  status: ProviderRuntimeStatus,
  models: ProviderModel[],
): ProviderRuntimeStatus {
  const next: ProviderRuntimeStatus = {
    ...status,
    provider,
    configured: status.configured,
    healthy: status.healthy === true,
    checking: false,
    status: status.status,
    source: status.source,
    modelCount: models.length,
  };
  return {
    ...next,
    availableForDisplay: isProviderDisplayable(next, models),
    availableForResearch: isProviderSelectableForUser(next, models),
  };
}

function isExplicitlyUnavailableForUser(status: ProviderRuntimeStatus): boolean {
  return status.status === "missing_key"
    || status.status === "invalid_key"
    || status.status === "billing_credits"
    || status.status === "rate_limited"
    || status.status === "unavailable";
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object";
}

function arrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}
