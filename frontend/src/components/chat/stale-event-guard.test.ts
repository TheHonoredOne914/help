import test from "node:test";
import assert from "node:assert/strict";
import { isStaleRunScopedEvent } from "./stale-event-guard";

const active = { runId: "run-a", assistantMessageId: "msg-a", conversationId: 10 };

test("runId must match active run", () => {
  assert.equal(isStaleRunScopedEvent({ runId: "run-b" }, active), true);
  assert.equal(isStaleRunScopedEvent({ runId: "run-a" }, active), false);
});

test("assistantMessageId must match when both are present", () => {
  assert.equal(isStaleRunScopedEvent({ runId: "run-a", assistantMessageId: "msg-b" }, active), true);
  assert.equal(isStaleRunScopedEvent({ runId: "run-a", assistantMessageId: "msg-a" }, active), false);
  assert.equal(isStaleRunScopedEvent({ runId: "run-a" }, active), false);
});

test("conversationId must match when both are present", () => {
  assert.equal(isStaleRunScopedEvent({ runId: "run-a", conversationId: 11 }, active), true);
  assert.equal(isStaleRunScopedEvent({ runId: "run-a", conversationId: 10 }, active), false);
  assert.equal(isStaleRunScopedEvent({ runId: "run-a" }, { ...active, conversationId: null }), false);
});
