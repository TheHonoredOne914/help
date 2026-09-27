import type { PipelineRunStatus } from "@/hooks/use-pipeline-state";
import { cn } from "@/lib/utils";
import { getStatusSemantics, severityClassName } from "@/lib/run-state/status-semantics";

interface StatusBadgeProps {
  status: PipelineRunStatus;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const semantics = getStatusSemantics(status);
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-semibold", severityClassName(semantics.severity))}>
      {label ?? semantics.label}
    </span>
  );
}
