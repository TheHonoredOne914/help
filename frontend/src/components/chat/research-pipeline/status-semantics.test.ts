import test from "node:test";
import assert from "node:assert/strict";
import { getStatusSemantics } from "./status-semantics";

test("completed is the only terminal success status", () => {
  assert.deepEqual(getStatusSemantics("completed"), {
    terminal: true,
    success: true,
    severity: "success",
    label: "Research Complete",
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
  assert.ok(["info", "warning"].includes(semantics.severity));
});
