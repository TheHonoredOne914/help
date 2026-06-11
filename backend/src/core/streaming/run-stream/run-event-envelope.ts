import type { ResearchRunIdentity } from "../../pipeline/pipeline-events.js";

export function envelopeRunEvent(identity: ResearchRunIdentity, eventType: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: identity.runId,
    requestId: identity.requestId,
    conversationId: identity.conversationId,
    userMessageId: identity.userMessageId,
    assistantMessageId: identity.assistantMessageId,
    queryHash: identity.queryHash,
    researchMode: identity.researchMode,
    effectiveResearchMode: identity.researchMode,
    eventType,
    ...payload,
  };
}
