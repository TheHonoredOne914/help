import test from "node:test";
import assert from "node:assert/strict";
import {
  getRunStatusSemantics,
  getStatusSemantics,
  isExplicitTerminalRunStatus,
} from "../status-semantics";

test("only completed is a successful terminal status", () => {
  assert.equal(getRunStatusSemantics("completed").isSuccessful, true);
  assert.equal(getRunStatusSemantics("completed").success, true);
  for (const status of ["completed_with_source_gaps", "degraded_fallback", "legacy_fallback_used", "failed", "provider_error", "cancelled"] as const) {
    assert.equal(getRunStatusSemantics(status).isSuccessful, false);
    assert.equal(isExplicitTerminalRunStatus(status), true);
  }
  assert.equal(isExplicitTerminalRunStatus("final_answer_ready"), false);
});

test("completed is the only terminal success status", () => {
  assert.deepEqual(getStatusSemantics("completed"), {
    label: "Research Complete",
    severity: "success",
    className: getStatusSemantics("completed").className,
    terminal: true,
    success: true,
    isTerminal: true,
    isSuccessful: true,
  });
});

test("source gaps and legacy fallback are warning terminal states", () => {
  for (const status of ["completed_with_source_gaps", "legacy_fallback_used"] as const) {
    const semantics = getStatusSemantics(status);
    assert.equal(semantics.terminal, true);
    assert.equal(semantics.success, false);
    assert.equal(semantics.severity, "warning");
  }
});

test("provider_error and failed are error terminal states", () => {
  for (const status of ["provider_error", "failed"] as const) {
    const semantics = getStatusSemantics(status);
    assert.equal(semantics.terminal, true);
    assert.equal(semantics.success, false);
    assert.equal(semantics.severity, "error");
  }
});

test("cancelled is terminal but not success", () => {
  const semantics = getStatusSemantics("cancelled");
  assert.equal(semantics.terminal, true);
  assert.equal(semantics.success, false);
  assert.equal(semantics.label, "Cancelled");
  assert.ok(["info", "warning"].includes(semantics.severity));
});

test("running and repairing are non-terminal", () => {
  assert.equal(getStatusSemantics("running").terminal, false);
  assert.equal(getStatusSemantics("repairing").terminal, false);
  assert.equal(getStatusSemantics("repairing").label, "Repairing Output");
});
