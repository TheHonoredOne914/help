import { decideFinalResearchStatus, type DecideFinalResearchStatusInput } from "../pipeline/final-status.js";
import { stripPipelineMetadata } from "../pipeline/pipeline-metadata.js";
import type { ResearchTerminalStatus } from "./types.js";

export interface RunTerminalDecision {
  terminalStatus: ResearchTerminalStatus;
  errorCode?: string;
  visibleAnswer: string;
}

export function getVisibleFinalAnswer(content: unknown): string {
  if (typeof content !== "string") return "";
  return stripPipelineMetadata(content).trim();
}

export function decideRunTerminalStatus(input: DecideFinalResearchStatusInput): RunTerminalDecision {
  const visibleAnswer = getVisibleFinalAnswer(input.visibleAnswer);
  if (!visibleAnswer) {
    return {
      terminalStatus: "failed",
      errorCode: "EMPTY_FINAL_ANSWER",
      visibleAnswer,
    };
  }

  return {
    terminalStatus: decideFinalResearchStatus({ ...input, visibleAnswer }),
    visibleAnswer,
  };
}

export function selectCanonicalRunTerminalStatus(
  decision: RunTerminalDecision,
  _pipelineTerminalStatus?: ResearchTerminalStatus,
): ResearchTerminalStatus {
  return decision.terminalStatus;
}
