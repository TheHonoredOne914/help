import type { ResearchTerminalStatus } from "./types.js";

export function normalizeFallbackStatus(input: { citedSourceCount?: number; unexpectedGenerationFailure?: boolean; legacyFallbackUsed?: boolean }): ResearchTerminalStatus {
  if ((input.citedSourceCount ?? 0) <= 0) return "failed";
  if (input.unexpectedGenerationFailure) return "degraded_fallback";
  if (input.legacyFallbackUsed) return "legacy_fallback_used";
  return "degraded_fallback";
}
