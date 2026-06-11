import { logger } from "../../lib/logger.js";
import { redactSecretString } from "../security/secret-redaction.js";

export type ProviderCallLogEvent =
  | "provider_model_route_status"
  | "provider_diagnostic"
  | "provider_call"
  | "search_provider_call"
  | "extraction_provider_call"
  | "generation_provider_call"
  | "source_usage_provider_call";

export interface ProviderCallLogInput {
  event: ProviderCallLogEvent;
  providerName: string;
  providerKind?: "generation" | "search" | "extraction" | "model_route" | "diagnostic";
  operation: string;
  statusCode?: number | null;
  latencyMs?: number | null;
  runId?: string | null;
  model?: string | null;
  errorCode?: string | null;
  retryAfterMs?: number | null;
  remainingRequests?: number | null;
  remainingTokens?: number | null;
  rateLimitRemaining?: string | number | null;
  rateLimitReset?: string | number | null;
  creditsRemaining?: string | number | null;
  success?: boolean;
  configured?: boolean;
  configuredFrom?: "browser" | "server_env" | "none" | string;
  healthy?: boolean;
  canListModels?: boolean;
  canChat?: boolean;
  chatVerified?: boolean;
  catalogFallbackOnly?: boolean;
  modelCount?: number;
  source?: string;
  query?: string;
  resultCount?: number;
}

export function logProviderCall(input: ProviderCallLogInput): void {
  const payload = {
    event: input.event,
    providerName: input.providerName,
    providerKind: input.providerKind,
    operation: input.operation,
    statusCode: input.statusCode ?? undefined,
    latencyMs: input.latencyMs ?? undefined,
    runId: input.runId ?? undefined,
    model: input.model ?? undefined,
    errorCode: input.errorCode ?? undefined,
    retryAfterMs: input.retryAfterMs ?? undefined,
    rateLimitRemaining: input.rateLimitRemaining ?? undefined,
    rateLimitReset: input.rateLimitReset ?? undefined,
    remainingRequests: input.remainingRequests ?? undefined,
    remainingTokens: input.remainingTokens ?? undefined,
    creditsRemaining: input.creditsRemaining ?? undefined,
    success: input.success,
    configured: input.configured,
    configuredFrom: input.configuredFrom,
    healthy: input.healthy,
    canListModels: input.canListModels,
    canChat: input.canChat,
    chatVerified: input.chatVerified,
    catalogFallbackOnly: input.catalogFallbackOnly,
    modelCount: input.modelCount,
    source: input.source,
    query: input.query ? redactSecretString(input.query).slice(0, 280) : undefined,
    resultCount: input.resultCount,
  };
  logger.info(payload, providerLogMessage(input.event));
}

function providerLogMessage(event: ProviderCallLogEvent): string {
  switch (event) {
    case "provider_model_route_status":
      return "provider model route status";
    case "provider_diagnostic":
      return "provider diagnostic completed";
    case "search_provider_call":
      return "search provider call completed";
    case "extraction_provider_call":
      return "extraction provider call completed";
    case "generation_provider_call":
      return "generation provider call completed";
    case "source_usage_provider_call":
      return "source usage provider call completed";
    default:
      return "provider call completed";
  }
}
