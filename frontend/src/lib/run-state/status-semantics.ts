import type { PipelineRunStatus, PipelineStatusSeverity } from "@/hooks/use-pipeline-state";

export interface RunStatusSemantics {
  label: string;
  severity: PipelineStatusSeverity;
  className: string;
  terminal: boolean;
  success: boolean;
}

const SEVERITY_CLASS: Record<PipelineStatusSeverity, string> = {
  success: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  info: "border border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-200",
};

const STATUS_TABLE: Record<PipelineRunStatus, RunStatusSemantics> = {
  idle: {
    label: "Idle",
    severity: "info",
    className: SEVERITY_CLASS.info,
    terminal: false,
    success: false,
  },
  running: {
    label: "Research Running",
    severity: "info",
    className: SEVERITY_CLASS.info,
    terminal: false,
    success: false,
  },
  repairing: {
    label: "Repairing Output",
    severity: "warning",
    className: SEVERITY_CLASS.warning,
    terminal: false,
    success: false,
  },
  completed: {
    label: "Research Complete",
    severity: "success",
    className: SEVERITY_CLASS.success,
    terminal: true,
    success: true,
  },
  completed_with_source_gaps: {
    label: "Completed With Source Gaps",
    severity: "warning",
    className: SEVERITY_CLASS.warning,
    terminal: true,
    success: false,
  },
  legacy_fallback_used: {
    label: "Legacy Fallback Used",
    severity: "warning",
    className: SEVERITY_CLASS.warning,
    terminal: true,
    success: false,
  },
  degraded_fallback: {
    label: "Degraded Fallback",
    severity: "warning",
    className: SEVERITY_CLASS.warning,
    terminal: true,
    success: false,
  },
  provider_error: {
    label: "Provider Error",
    severity: "error",
    className: SEVERITY_CLASS.error,
    terminal: true,
    success: false,
  },
  failed: {
    label: "Research Failed",
    severity: "error",
    className: SEVERITY_CLASS.error,
    terminal: true,
    success: false,
  },
  cancelled: {
    label: "Cancelled",
    severity: "info",
    className: SEVERITY_CLASS.info,
    terminal: true,
    success: false,
  },
};

export const terminalRunStatuses = new Set<PipelineRunStatus>(
  (Object.entries(STATUS_TABLE) as Array<[PipelineRunStatus, RunStatusSemantics]>)
    .filter(([, row]) => row.terminal)
    .map(([status]) => status),
);

export function isExplicitTerminalRunStatus(status: unknown): status is PipelineRunStatus {
  return typeof status === "string" && terminalRunStatuses.has(status as PipelineRunStatus);
}

export type RunStatusSemanticsView = RunStatusSemantics & {
  isTerminal: boolean;
  isSuccessful: boolean;
};

export function getRunStatusSemantics(status: PipelineRunStatus): RunStatusSemanticsView {
  const row = STATUS_TABLE[status] ?? STATUS_TABLE.running;
  return {
    ...row,
    isTerminal: row.terminal,
    isSuccessful: row.success,
  };
}

/** Alias used by pipeline UI components. */
export const getStatusSemantics = getRunStatusSemantics;

/** Alias used by chat-run-status and legacy hooks. */
export function getPipelineTerminalStatusSemantics(status: PipelineRunStatus): {
  isTerminal: boolean;
  isSuccessful: boolean;
  severity: PipelineStatusSeverity;
  label: string;
  className: string;
} {
  const row = getRunStatusSemantics(status);
  return {
    isTerminal: row.terminal,
    isSuccessful: row.success,
    severity: row.severity,
    label: row.label,
    className: row.className,
  };
}

export function severityClassName(severity: PipelineStatusSeverity): string {
  return SEVERITY_CLASS[severity] ?? SEVERITY_CLASS.info;
}
