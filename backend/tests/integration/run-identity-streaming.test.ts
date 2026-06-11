import test from "node:test";
import assert from "node:assert/strict";
import { missingRunEnvelopeFields, shouldAcceptRunScopedEvent } from "../../src/core/streaming/run-event-scope.js";

test("run-scoped events require run and assistant identity", () => {
  const active = { runId: "run_B", conversationId: 12, assistantMessageId: 102 };
  const promptA = {
    runId: "run_A",
    requestId: "req_A",
    conversationId: 12,
    assistantMessageId: 101,
    researchMode: "council" as const,
    eventType: "answer_delta",
    content: "Prompt A content",
  };
  const promptB = {
    runId: "run_B",
    requestId: "req_B",
    conversationId: 12,
    assistantMessageId: 102,
    researchMode: "council" as const,
    eventType: "answer_delta",
    content: "Prompt B content",
  };

  assert.equal(shouldAcceptRunScopedEvent(promptA, active), false);
  assert.equal(shouldAcceptRunScopedEvent(promptB, active), true);
  assert.deepEqual(missingRunEnvelopeFields(promptB), []);
});

test("events missing assistantMessageId are stale by default", () => {
  assert.equal(shouldAcceptRunScopedEvent({
    runId: "run_B",
    requestId: "req_B",
    conversationId: 12,
    researchMode: "deep_research",
    eventType: "source_contract",
  }, { runId: "run_B", conversationId: 12, assistantMessageId: 102 }), false);
});
