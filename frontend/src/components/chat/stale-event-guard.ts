export interface RunScopeIdentity {
  runId?: string | number | null;
  assistantMessageId?: string | number | null;
  conversationId?: string | number | null;
}

export function isStaleRunScopedEvent(data: RunScopeIdentity, active: RunScopeIdentity): boolean {
  const sameRun = data.runId === active.runId;
  const sameAssistant = !data.assistantMessageId || !active.assistantMessageId || data.assistantMessageId === active.assistantMessageId;
  const sameConversation = !data.conversationId || !active.conversationId || String(data.conversationId) === String(active.conversationId);
  return !sameRun || !sameAssistant || !sameConversation;
}
