import test from "node:test";
import assert from "node:assert/strict";
import { getRunStatusSemantics, isExplicitTerminalRunStatus } from "../status-semantics";

test("only completed is a successful terminal status", () => {
  assert.equal(getRunStatusSemantics("completed").isSuccessful, true);
  for (const status of ["completed_with_source_gaps", "degraded_fallback", "legacy_fallback_used", "failed", "provider_error", "cancelled"] as const) {
    assert.equal(getRunStatusSemantics(status).isSuccessful, false);
    assert.equal(isExplicitTerminalRunStatus(status), true);
  }
  assert.equal(isExplicitTerminalRunStatus("final_answer_ready"), false);
});
