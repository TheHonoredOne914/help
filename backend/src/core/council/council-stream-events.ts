import type { ResearchRunIdentity } from "../pipeline/pipeline-events.js";
import { envelopeRunEvent } from "../streaming/run-stream/run-event-envelope.js";
import type { CouncilDispute, CouncilSeal, CouncilVerdict, CouncillorOutput, RetrievingCouncillorId } from "./council-types.js";

export function councilCStarted(identity: ResearchRunIdentity, councillorId: RetrievingCouncillorId, title: string): Record<string, unknown> {
  return envelopeRunEvent(identity, "council_c_started", { councillorId, title });
}

export function councilCChunk(identity: ResearchRunIdentity, councillorId: RetrievingCouncillorId, chunk: string): Record<string, unknown> {
  return envelopeRunEvent(identity, "council_c_chunk", { councillorId, chunk });
}

export function councilCComplete(identity: ResearchRunIdentity, councillor: CouncillorOutput): Record<string, unknown> {
  return envelopeRunEvent(identity, "council_c_complete", { councillor });
}

export function deliberationUpdate(identity: ResearchRunIdentity, seals: CouncilSeal[], disputes: CouncilDispute[], agreementScore: number): Record<string, unknown> {
  return envelopeRunEvent(identity, "deliberation_update", { seals, disputes, agreementScore });
}

export function chiefVerdictChunk(identity: ResearchRunIdentity, chunk: string): Record<string, unknown> {
  return envelopeRunEvent(identity, "chief_verdict_chunk", { chunk });
}

export function chiefVerdictComplete(identity: ResearchRunIdentity, verdict: CouncilVerdict | null): Record<string, unknown> {
  return envelopeRunEvent(identity, "chief_verdict_complete", { verdict });
}
