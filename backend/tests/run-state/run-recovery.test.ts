import test from "node:test";
import assert from "node:assert/strict";
import { recoverStaleRunningRuns } from "../../src/core/run-state/run-recovery.js";

test("server restart recovery marks stale running runs interrupted", () => {
  const recovered = recoverStaleRunningRuns([{
    runId: "r",
    conversationId: 1,
    assistantMessageId: 2,
    phase: "generation",
    status: "running",
    startedAt: "2026-05-30T00:00:00.000Z",
    lastHeartbeatAt: "2026-05-30T00:00:00.000Z",
  }], new Date("2026-05-30T00:10:00.000Z").getTime(), 60_000);

  assert.equal(recovered[0].status, "interrupted");
  assert.equal(recovered[0].phase, "terminal");
});
