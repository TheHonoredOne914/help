import type { ResearchRunIdentity } from "../pipeline/pipeline-events.js";
import type { CouncilDispute, CouncilSeal, CouncilVerdict, CouncillorOutput, RetrievingCouncillorId } from "./council-types.js";

export type CouncilSseEvent =
  | { eventType: "council_c_started"; identity: ResearchRunIdentity; councillorId: RetrievingCouncillorId; title: string }
  | { eventType: "council_c_chunk"; identity: ResearchRunIdentity; councillorId: RetrievingCouncillorId; chunk: string }
  | { eventType: "council_c_complete"; identity: ResearchRunIdentity; councillor: CouncillorOutput }
  | { eventType: "deliberation_update"; identity: ResearchRunIdentity; seals: CouncilSeal[]; disputes: CouncilDispute[]; agreementScore: number }
  | { eventType: "chief_verdict_chunk"; identity: ResearchRunIdentity; chunk: string }
  | { eventType: "chief_verdict_complete"; identity: ResearchRunIdentity; verdict: CouncilVerdict | null };
