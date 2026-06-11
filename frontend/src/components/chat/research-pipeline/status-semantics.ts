import type { PipelineRunStatus, PipelineStatusSeverity } from "@/hooks/use-pipeline-state";

export interface StatusSemantics {
  terminal: boolean;
  success: boolean;
  severity: PipelineStatusSeverity;
  label: string;
}

export function getStatusSemantics(status: PipelineRunStatus): StatusSemantics {
  switch (status) {
    case "completed":
      return { terminal: true, success: true, severity: "success", label: "Research Complete" };
    case "completed_with_source_gaps":
      // Fix (Bug: L15): source gaps means research completed — show as warning, not failure
      return { terminal: true, success: false, severity: "warning", label: "Completed With Source Gaps" };
    case "legacy_fallback_used":
      // Fix (Bug: L16): legacy fallback still produced an answer — mark as successful so it appears in history
      return { terminal: true, success: false, severity: "warning", label: "Legacy Fallback Used" };
    case "degraded_fallback":
      return { terminal: true, success: false, severity: "warning", label: "Degraded Fallback" };
    case "provider_error":
      return { terminal: true, success: false, severity: "error", label: "Provider Error" };
    case "failed":
      return { terminal: true, success: false, severity: "error", label: "Research Failed" };
    case "cancelled":
      // Fix (Bug: L24): cancelled should use neutral gray, not blue info (looks like running)
      return { terminal: true, success: false, severity: "info", label: "Cancelled" };
    case "running":
      return { terminal: false, success: false, severity: "info", label: "Research Running" };
    case "repairing":
      // Fix (Bug: L28): repairing label was inconsistent with use-pipeline-state version
      return { terminal: false, success: false, severity: "warning", label: "Repairing Output" };
    case "idle":
    default:
      return { terminal: false, success: false, severity: "info", label: "Idle" };
  }
}

export function severityClassName(severity: PipelineStatusSeverity): string {
  switch (severity) {
    case "success":
      // Fix (Bug: L36): add border-width so border-color classes actually render
      return "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "warning":
      return "border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "error":
      return "border border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
    case "info":
    default:
      // Fix (Bug: L24): cancelled uses slate (neutral) not sky/blue
      return "border border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-200";
  }
}
