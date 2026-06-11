import type { ResearchRunIdentity, ResearchTerminalStatus } from "./types.js";

export function normalizeLegacyResult(input: {
  runIdentity: ResearchRunIdentity;
  terminalStatus: ResearchTerminalStatus;
  finalAnswer?: string;
  sources?: unknown[];
  citationReport?: unknown;
  qualityGateReport?: unknown;
  sourceGapReport?: unknown;
  divisionOutputs?: unknown;
  error?: unknown;
}): Record<string, unknown> {
  return {
    runId: input.runIdentity.runId,
    requestId: input.runIdentity.requestId,
    conversationId: input.runIdentity.conversationId,
    assistantMessageId: input.runIdentity.assistantMessageId,
    terminalStatus: input.terminalStatus,
    finalAnswer: input.finalAnswer ?? "",
    sources: input.sources ?? [],
    citationReport: input.citationReport ?? null,
    qualityGateReport: input.qualityGateReport ?? null,
    sourceGapReport: input.sourceGapReport ?? null,
    divisionOutputs: input.divisionOutputs ?? {},
    legacyFallbackUsed: input.terminalStatus === "legacy_fallback_used",
    error: input.error ?? null,
  };
}
