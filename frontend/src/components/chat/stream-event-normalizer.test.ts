import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStreamEvent,
  updateTerminalEventState,
  type ChatRunIdentity,
  type StreamTerminalEventState,
} from "./stream-event-normalizer";

const active: ChatRunIdentity = {
  runId: "run-a",
  assistantMessageId: "assistant-a",
  conversationId: 10,
  researchMode: "deep_research",
};

test("run_started replaces the client run identity with the backend identity", () => {
  const event = normalizeStreamEvent(
    {
      eventType: "run_started",
      runId: "run-server",
      assistantMessageId: "assistant-server",
      conversationId: 10,
      researchMode: "deep_research",
    },
    { runId: "client-1", assistantMessageId: null, conversationId: 10 },
    10,
  );

  assert.equal(event.kind, "run_started");
  assert.deepEqual(event.nextIdentity, {
    runId: "run-server",
    assistantMessageId: "assistant-server",
    conversationId: 10,
    researchMode: "deep_research",
  });
});

test("run-scoped events from another assistant message are ignored", () => {
  const event = normalizeStreamEvent(
    {
      eventType: "content",
      runId: "run-a",
      assistantMessageId: "assistant-b",
      conversationId: 10,
      content: "stale output",
    },
    active,
    10,
  );

  assert.equal(event.kind, "ignored_stale");
});

test("terminal failure keeps precedence over a later generic done frame", () => {
  const failed = updateTerminalEventState(
    initialTerminalState(),
    normalizeStreamEvent(
      {
        eventType: "provider_error",
        runId: "run-a",
        assistantMessageId: "assistant-a",
        conversationId: 10,
      },
      active,
      10,
    ),
  );
  const afterDone = updateTerminalEventState(
    failed,
    normalizeStreamEvent(
      {
        done: true,
        eventType: "completed",
        runId: "run-a",
        assistantMessageId: "assistant-a",
        conversationId: 10,
      },
      active,
      10,
    ),
  );

  assert.equal(afterDone.failureReceived, true);
  assert.equal(afterDone.successReceived, false);
  assert.equal(afterDone.receivedDone, false);
  assert.equal(afterDone.finalStatus, "provider_error");
});

function initialTerminalState(): StreamTerminalEventState {
  return {
    failureReceived: false,
    successReceived: false,
    receivedDone: false,
    citationStatusReceived: false,
    finalStatus: null,
  };
}
