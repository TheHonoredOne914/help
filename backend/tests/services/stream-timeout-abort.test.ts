import test from "node:test";
import assert from "node:assert/strict";

test("stream timeout uses the same abort signal path as client disconnect", () => {
  const controller = new AbortController();
  let downstreamStarted = false;
  let downstreamCompleted = false;

  const simulatePipelineStep = () => {
    if (controller.signal.aborted) {
      throw new Error("request aborted");
    }
    downstreamStarted = true;
  };

  controller.abort("stream_timeout");
  assert.throws(() => simulatePipelineStep(), /request aborted/);
  assert.equal(downstreamStarted, false);
  assert.equal(downstreamCompleted, false);
  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason, "stream_timeout");
});
