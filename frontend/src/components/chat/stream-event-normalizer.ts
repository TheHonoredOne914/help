import type { ChatMode } from "./chat-model-routing";
import { isStaleRunScopedEvent } from "./stale-event-guard";
import type { PipelineRunStatus } from "@/hooks/use-pipeline-state";
import { normalizeTerminalEvent } from "@/lib/run-state/terminal-event-normalizer";

export interface ChatRunIdentity {
  runId: string | null;
  requestId?: string | null;
  assistantMessageId?: string | number | null;
  conversationId?: string | number | null;
  researchMode?: ChatMode | string | null;
}

export type NormalizedStreamEvent =
  | { kind: "run_started"; data: Record<string, unknown>; nextIdentity: ChatRunIdentity }
  | { kind: "ignored_stale"; data: Record<string, unknown> }
  | { kind: "terminal"; data: Record<string, unknown>; status: PipelineRunStatus; failure: boolean; done: boolean }
  | { kind: "content"; data: Record<string, unknown>; chunk: string }
  | { kind: "data"; data: Record<string, unknown> };

export interface StreamTerminalEventState {
  failureReceived: boolean;
  successReceived: boolean;
  receivedDone: boolean;
  citationStatusReceived: boolean;
  finalStatus: PipelineRunStatus | null;
}

export function normalizeStreamEvent(
  raw: unknown,
  active: ChatRunIdentity,
  fallbackConversationId: string | number | null,
): NormalizedStreamEvent {
  const data = isRecord(raw) ? raw : {};
  if (typeof data.runId === "string" && data.eventType === "run_started") {
    const nextIdentity: ChatRunIdentity = {
      runId: data.runId,
      assistantMessageId: identityOrNull(data.assistantMessageId),
      conversationId: identityOrNull(data.conversationId) ?? fallbackConversationId,
      researchMode: stringOrNull(data.researchMode ?? data.selectedResearchMode ?? data.effectiveResearchMode),
    };
    const requestId = stringOrNull(data.requestId);
    if (requestId) nextIdentity.requestId = requestId;
    return {
      kind: "run_started",
      data,
      nextIdentity,
    };
  }

  if (typeof data.runId === "string" && isStaleRunScopedEvent(data, active)) {
    return { kind: "ignored_stale", data };
  }

  const terminalStatus = terminalStatusFromEvent(data);
  if (terminalStatus) {
    const failure = terminalStatus === "failed" || terminalStatus === "provider_error" || terminalStatus === "cancelled";
    return { kind: "terminal", data, status: terminalStatus, failure, done: Boolean(data.done) };
  }

  if (typeof data.content === "string") {
    return { kind: "content", data, chunk: data.content };
  }

  return { kind: "data", data };
}

export function updateTerminalEventState(
  state: StreamTerminalEventState,
  event: NormalizedStreamEvent,
): StreamTerminalEventState {
  if (event.kind !== "terminal") return state;
  if (event.failure) {
    return {
      ...state,
      failureReceived: true,
      successReceived: false,
      receivedDone: false,
      finalStatus: event.status,
    };
  }
  if (state.failureReceived) return state;
  return {
    ...state,
    successReceived: true,
    receivedDone: event.done || state.receivedDone,
    finalStatus: event.status,
  };
}

export function markCitationStatusReceived(state: StreamTerminalEventState): StreamTerminalEventState {
  return { ...state, citationStatusReceived: true };
}

function terminalStatusFromEvent(data: Record<string, unknown>): PipelineRunStatus | null {
  return normalizeTerminalEvent(data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function identityOrNull(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}
