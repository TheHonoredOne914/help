import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import type { SourceGapReport } from "./research-pipeline.js";

export interface ResearchPipelineStateSnapshot {
  requestId: string;
  agendaContract?: AgendaContract;
  evidenceRegistry?: EvidenceRegistryCore;
  sourceGapReport?: SourceGapReport | null;
  phase: string;
  updatedAt: string;
}

export function createPipelineState(requestId: string): ResearchPipelineStateSnapshot {
  return {
    requestId,
    phase: "request_received",
    updatedAt: new Date().toISOString(),
  };
}

export function updatePipelinePhase(
  state: ResearchPipelineStateSnapshot,
  phase: string,
): ResearchPipelineStateSnapshot {
  return {
    ...state,
    phase,
    updatedAt: new Date().toISOString(),
  };
}
