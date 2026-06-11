import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTerminalEvent } from "../terminal-event-normalizer";

test("final_answer_ready is a data event, not a terminal event", () => {
  assert.deepEqual(normalizeTerminalEvent({
    eventType: "core_pipeline_event",
    corePipelineEvent: "final_answer_ready",
    done: true,
  }), null);
});

test("only explicit backend terminal statuses end a run", () => {
  assert.equal(normalizeTerminalEvent({ eventType: "completed", terminalStatus: "completed", done: true }), "completed");
  assert.equal(normalizeTerminalEvent({ eventType: "failed", terminalStatus: "failed", done: true }), "failed");
  assert.equal(normalizeTerminalEvent({ done: true }), null);
});
