import type { PipelineRunStatus } from "@/hooks/use-pipeline-state";
import { getRunStatusSemantics } from "./status-semantics";

export function completeFromBackendStatus(status: PipelineRunStatus): { runStatus: PipelineRunStatus; isComplete: boolean } {
  return {
    runStatus: status,
    isComplete: getRunStatusSemantics(status).isSuccessful,
  };
}
