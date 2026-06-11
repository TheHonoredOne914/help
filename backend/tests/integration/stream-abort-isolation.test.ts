import test from "node:test";
import assert from "node:assert/strict";
import { shouldAcceptRunScopedEvent } from "../../src/core/streaming/run-event-scope.js";

test("cancelled old run cannot keep writing into the active assistant bubble", () => {
  const active = { runId: "run_B", conversationId: 1, assistantMessageId: 202 };
  const events = [
    { runId: "run_A", requestId: "req_A", conversationId: 1, assistantMessageId: 201, researchMode: "deep_research" as const, eventType: "cancelled", done: true },
    { runId: "run_A", requestId: "req_A", conversationId: 1, assistantMessageId: 201, researchMode: "deep_research" as const, eventType: "answer_delta", content: "old answer" },
    { runId: "run_B", requestId: "req_B", conversationId: 1, assistantMessageId: 202, researchMode: "deep_research" as const, eventType: "answer_delta", content: "new answer" },
  ];

  const accepted = events.filter((event) => shouldAcceptRunScopedEvent(event, active));
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].content, "new answer");
});
