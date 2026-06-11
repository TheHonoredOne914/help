import test from "node:test";
import assert from "node:assert/strict";
import { isStaleRunStateEvent } from "../stale-event-guard";

test("run-state stale guard rejects wrong run, assistant, or conversation", () => {
  const active = { runId: "r1", assistantMessageId: 2, conversationId: 1 };
  assert.equal(isStaleRunStateEvent({ runId: "r2", assistantMessageId: 2, conversationId: 1 }, active), true);
  assert.equal(isStaleRunStateEvent({ runId: "r1", assistantMessageId: 3, conversationId: 1 }, active), true);
  assert.equal(isStaleRunStateEvent({ runId: "r1", assistantMessageId: 2, conversationId: 9 }, active), true);
  assert.equal(isStaleRunStateEvent({ runId: "r1", assistantMessageId: 2, conversationId: 1 }, active), false);
});
