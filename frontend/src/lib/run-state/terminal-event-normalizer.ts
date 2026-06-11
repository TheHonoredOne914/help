import type { PipelineRunStatus } from "@/hooks/use-pipeline-state";
import { isExplicitTerminalRunStatus } from "./status-semantics";

export function normalizeTerminalEvent(data: Record<string, unknown>): PipelineRunStatus | null {
  const terminalStatus = data.terminalStatus;
  if (isExplicitTerminalRunStatus(terminalStatus)) return terminalStatus;

  const eventType = data.eventType;
  if (isExplicitTerminalRunStatus(eventType)) return eventType;
  if (eventType === "pipeline_failed" || eventType === "source_usage_failed" || eventType === "quality_gate_failed") {
    return "failed";
  }

  return null;
}
