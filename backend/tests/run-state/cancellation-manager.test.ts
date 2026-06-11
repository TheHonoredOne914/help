import test from "node:test";
import assert from "node:assert/strict";
import { RunCancellationManager } from "../../src/core/run-state/cancellation-manager.js";

test("starting a second run cancels and persists the superseded run", async () => {
  const manager = new RunCancellationManager();
  const persisted: Array<{ runId: string; reason: string }> = [];

  const first = await manager.startRun({
    identity: { runId: "r1", requestId: "q1", conversationId: 1, assistantMessageId: 2, queryHash: "h1", researchMode: "deep_research", createdAt: "2026-05-30T00:00:00.000Z" },
    persistCancelled: async (record, reason) => { persisted.push({ runId: record.runId, reason }); },
  });
  await manager.startRun({
    identity: { runId: "r2", requestId: "q2", conversationId: 1, assistantMessageId: 3, queryHash: "h2", researchMode: "deep_research", createdAt: "2026-05-30T00:00:01.000Z" },
  });

  assert.equal(first.signal.aborted, true);
  assert.deepEqual(persisted, [{ runId: "r1", reason: "superseded_by_new_prompt" }]);
});
