import type { VisibleRunError } from "./types.js";

export function normalizeProviderError(input: {
  provider?: string;
  model?: string;
  status?: number;
  code?: string;
  message?: string;
  stage?: string;
  retryable?: boolean;
}): VisibleRunError {
  return {
    code: input.code ?? "PROVIDER_ERROR",
    message: (input.message ?? "Provider request failed.").slice(0, 500),
    provider: input.provider,
    model: input.model,
    httpStatus: input.status,
    stage: input.stage,
    retryable: input.retryable,
  };
}
