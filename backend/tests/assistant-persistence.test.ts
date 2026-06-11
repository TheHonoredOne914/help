import assert from "node:assert/strict";
import test from "node:test";

import {
  maybeMergeArchive,
  persistAssistantCompleted,
  persistAssistantFailed,
  type AssistantPersistenceStore,
} from "../src/services/assistant-persistence.js";

function createStore() {
  const calls: Array<{ type: "insert" | "update"; id?: number | string; conversationId?: number; content: string }> = [];
  const store: AssistantPersistenceStore = {
    async insertAssistantMessage(conversationId, content) {
      calls.push({ type: "insert", conversationId, content });
    },
    async updateAssistantMessage(id, content) {
      calls.push({ type: "update", id, content });
    },
  };
  return { store, calls };
}

test("completed research updates the existing assistant placeholder instead of inserting a duplicate row", async () => {
  const { store, calls } = createStore();

  const result = await persistAssistantCompleted({
    store,
    conversationId: 9,
    assistantMessageId: 42,
    content: "Validated final research answer",
  });

  assert.equal(result.action, "updated");
  assert.deepEqual(calls, [
    { type: "update", id: 42, content: "Validated final research answer" },
  ]);
});

test("completed normal chat inserts an assistant row only when no placeholder exists", async () => {
  const { store, calls } = createStore();

  const result = await persistAssistantCompleted({
    store,
    conversationId: 9,
    content: "Complete normal answer",
  });

  assert.equal(result.action, "inserted");
  assert.deepEqual(calls, [
    { type: "insert", conversationId: 9, content: "Complete normal answer" },
  ]);
});

test("failed stream persists an explicit failure instead of partial generated text", async () => {
  const { store, calls } = createStore();

  const result = await persistAssistantFailed({
    store,
    conversationId: 9,
    assistantMessageId: 42,
    title: "Response Failed",
    message: "The model stream failed after partial output.",
    partialContent: "This partial answer must not be saved.",
  });

  assert.equal(result.action, "updated");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.type, "update");
  assert.match(calls[0]?.content ?? "", /Response Failed/);
  assert.match(calls[0]?.content ?? "", /model stream failed/i);
  assert.doesNotMatch(calls[0]?.content ?? "", /partial answer must not be saved/i);
});

test("archive merge helper rejects fallback, failed, and source-gap terminal states", async () => {
  let mergeCalls = 0;
  const base = {
    qualityGate: { passed: true, repairRequired: false },
    sourceContract: { passedStrict: true, status: "passed" as const },
    finalAnswer: "Validated answer",
    merge: async () => {
      mergeCalls += 1;
    },
  };

  assert.equal(await maybeMergeArchive({ ...base, terminalStatus: "failed" }), false);
  assert.equal(await maybeMergeArchive({ ...base, terminalStatus: "legacy_fallback_used", legacyFallbackUsed: true }), false);
  assert.equal(await maybeMergeArchive({ ...base, terminalStatus: "completed_with_source_gaps" }), false);
  assert.equal(mergeCalls, 0);
});

test("archive merge helper allows only strict completed validated answers", async () => {
  let mergeCalls = 0;

  const merged = await maybeMergeArchive({
    terminalStatus: "completed",
    qualityGate: { passed: true, repairRequired: false },
    legacyFallbackUsed: false,
    sourceContract: { passedStrict: true, status: "passed" },
    finalAnswer: "Validated answer",
    merge: async () => {
      mergeCalls += 1;
    },
  });

  assert.equal(merged, true);
  assert.equal(mergeCalls, 1);
});
