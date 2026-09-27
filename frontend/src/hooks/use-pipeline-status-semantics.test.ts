import test from "node:test";
import assert from "node:assert/strict";
import { getPipelineTerminalStatusSemantics } from "./use-pipeline-state";

test("pipeline terminal status separates terminal from success", () => {
  const completed = getPipelineTerminalStatusSemantics("completed");
  assert.equal(completed.isTerminal, true);
  assert.equal(completed.isSuccessful, true);
  assert.equal(completed.severity, "success");
  assert.equal(completed.label, "Research Complete");
  assert.match(completed.className, /emerald/);
  assert.equal(getPipelineTerminalStatusSemantics("completed_with_source_gaps").isSuccessful, false);
  assert.equal(getPipelineTerminalStatusSemantics("completed_with_source_gaps").severity, "warning");
  assert.equal(getPipelineTerminalStatusSemantics("legacy_fallback_used").isSuccessful, false);
  assert.equal(getPipelineTerminalStatusSemantics("provider_error").severity, "error");
});
