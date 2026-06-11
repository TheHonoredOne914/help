import type { PipelineRunStatus, PipelineStatusSeverity } from "@/hooks/use-pipeline-state";

export interface PipelineTerminalStatusSemantics {
  isTerminal: boolean;
  isSuccessful: boolean;
  severity: PipelineStatusSeverity;
  label: string;
}

export const terminalRunStatuses = new Set<PipelineRunStatus>([
  "completed",
  "completed_with_source_gaps",
  "degraded_fallback",
  "failed",
  "provider_error",
  "legacy_fallback_used",
  "cancelled",
]);

export function isExplicitTerminalRunStatus(status: unknown): status is PipelineRunStatus {
  return typeof status === "string" && terminalRunStatuses.has(status as PipelineRunStatus);
}

export function getRunStatusSemantics(status: PipelineRunStatus): PipelineTerminalStatusSemantics {
  switch (status) {
    case "completed":
      return { isTerminal: true, isSuccessful: true, severity: "success", label: "Research Complete" };
    case "completed_with_source_gaps":
      return { isTerminal: true, isSuccessful: false, severity: "warning", label: "Completed With Source Gaps" };
    case "legacy_fallback_used":
      return { isTerminal: true, isSuccessful: false, severity: "warning", label: "Legacy Fallback Used" };
    case "degraded_fallback":
      return { isTerminal: true, isSuccessful: false, severity: "warning", label: "Degraded Fallback" };
    case "provider_error":
      return { isTerminal: true, isSuccessful: false, severity: "error", label: "Provider Error" };
    case "failed":
      return { isTerminal: true, isSuccessful: false, severity: "error", label: "Research Failed" };
    case "cancelled":
      return { isTerminal: true, isSuccessful: false, severity: "info", label: "Research Cancelled" };
    default:
      return { isTerminal: false, isSuccessful: false, severity: "info", label: "Research Running" };
  }
}
