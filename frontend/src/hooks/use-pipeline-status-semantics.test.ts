import test from "node:test";
import assert from "node:assert/strict";
import { getPipelineTerminalStatusSemantics } from "./use-pipeline-state";

test("pipeline terminal status separates terminal from success", () => {
  assert.deepEqual(getPipelineTerminalStatusSemantics("completed"), {
    isTerminal: true,
    isSuccessful: true,
    severity: "success",
    label: "Research Complete",
  });
  assert.equal(getPipelineTerminalStatusSemantics("completed_with_source_gaps").isSuccessful, false);
  assert.equal(getPipelineTerminalStatusSemantics("completed_with_source_gaps").severity, "warning");
  assert.equal(getPipelineTerminalStatusSemantics("legacy_fallback_used").isSuccessful, false);
  assert.equal(getPipelineTerminalStatusSemantics("provider_error").severity, "error");
});
