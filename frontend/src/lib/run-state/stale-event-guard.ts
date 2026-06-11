export interface RunIdentityLike {
  runId?: string | null;
  assistantMessageId?: string | number | null;
  conversationId?: string | number | null;
}

export function isStaleRunStateEvent(data: Record<string, unknown>, active: RunIdentityLike): boolean {
  if (typeof data.runId === "string" && active.runId && data.runId !== active.runId) return true;
  if (data.assistantMessageId != null && active.assistantMessageId != null && String(data.assistantMessageId) !== String(active.assistantMessageId)) return true;
  if (data.conversationId != null && active.conversationId != null && String(data.conversationId) !== String(active.conversationId)) return true;
  return false;
}
