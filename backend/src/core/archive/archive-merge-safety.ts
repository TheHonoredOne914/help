import type { PipelineSourceContractMetadata, ResearchTerminalStatus } from "../pipeline/pipeline-metadata.js";

export interface ArchiveMergeSafetyInput {
  terminalStatus: ResearchTerminalStatus;
  qualityGate?: { passed?: boolean; repairRequired?: boolean } | null;
  legacyFallbackUsed?: boolean;
  sourceContract?: Pick<PipelineSourceContractMetadata, "passedStrict" | "status"> | null;
  finalAnswer: string;
  allowCompletedWithSourceGaps?: boolean;
}

export function canMergeResearchAnswerIntoArchive(input: ArchiveMergeSafetyInput): boolean {
  if (input.terminalStatus !== "completed") {
    if (!(input.allowCompletedWithSourceGaps && input.terminalStatus === "completed_with_source_gaps")) return false;
  }
  if (input.qualityGate?.passed !== true) return false;
  if (input.qualityGate?.repairRequired === true) return false;
  if (input.legacyFallbackUsed === true) return false;
  if (input.sourceContract?.passedStrict !== true) return false;
  if (!input.finalAnswer.trim()) return false;
  if (/BESTDEL_PIPELINE|Research Incomplete|Legacy fallback answer retained|Core generation could not produce a validated final answer/i.test(input.finalAnswer)) return false;
  return true;
}
