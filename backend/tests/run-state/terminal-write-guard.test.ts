import test from "node:test";
import assert from "node:assert/strict";
import { TerminalWriteGuard } from "../../src/core/streaming/run-stream/terminal-write-guard.js";

test("terminal write guard blocks content after terminal event", () => {
  const guard = new TerminalWriteGuard();

  assert.equal(guard.canWrite({ eventType: "completed", terminalStatus: "completed", done: true }), true);
  assert.equal(guard.canWrite({ eventType: "answer_delta", content: "late" }), false);
  assert.equal(guard.canWrite({ eventType: "diagnostic", diagnosticSafe: true }), true);
  assert.equal(guard.diagnostics.blockedWrites, 1);
});
