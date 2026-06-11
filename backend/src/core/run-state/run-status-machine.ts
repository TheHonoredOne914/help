import type { ResearchTerminalStatus } from "./types.js";

const terminalStatuses = new Set<ResearchTerminalStatus>([
  "completed",
  "completed_with_source_gaps",
  "degraded_fallback",
  "failed",
  "provider_error",
  "legacy_fallback_used",
  "cancelled",
]);

export function isResearchTerminalStatus(value: unknown): value is ResearchTerminalStatus {
  return typeof value === "string" && terminalStatuses.has(value as ResearchTerminalStatus);
}

export function assertValidRunTransition(current: ResearchTerminalStatus | "running", next: ResearchTerminalStatus | "running"): void {
  if (current !== "running" && current !== next) {
    throw new Error(`Invalid run transition after terminal status: ${current} -> ${next}`);
  }
}
