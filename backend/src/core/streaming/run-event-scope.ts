import type { ResearchMode } from "../config/research-mode.js";

export interface RunScopedEventEnvelope {
  runId?: string;
  requestId?: string;
  conversationId?: number | string;
  userMessageId?: number | string;
  assistantMessageId?: number | string;
  queryHash?: string;
  researchMode?: ResearchMode;
  eventType?: string;
  [key: string]: unknown;
}

export interface ActiveRunScope {
  runId: string;
  conversationId: number | string;
  assistantMessageId: number | string;
}

export function isRunScopedEvent(event: unknown): event is RunScopedEventEnvelope {
  return Boolean(
    event &&
    typeof event === "object" &&
    typeof (event as RunScopedEventEnvelope).runId === "string" &&
    typeof (event as RunScopedEventEnvelope).eventType === "string",
  );
}

export function shouldAcceptRunScopedEvent(event: RunScopedEventEnvelope, active: ActiveRunScope): boolean {
  return (
    event.runId === active.runId &&
    event.conversationId != null &&
    event.assistantMessageId != null &&
    String(event.conversationId) === String(active.conversationId) &&
    String(event.assistantMessageId) === String(active.assistantMessageId)
  );
}

export function missingRunEnvelopeFields(event: RunScopedEventEnvelope): string[] {
  return [
    "runId",
    "requestId",
    "conversationId",
    "assistantMessageId",
    "researchMode",
    "eventType",
  ].filter((key) => event[key] == null);
}
