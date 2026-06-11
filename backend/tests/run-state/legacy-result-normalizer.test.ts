import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLegacyResult } from "../../src/core/run-state/legacy-result-normalizer.js";

test("legacy fallback emits core-compatible shape with diagnostics", () => {
  const result = normalizeLegacyResult({
    runIdentity: { runId: "r", requestId: "q", conversationId: 1, assistantMessageId: 2, queryHash: "h", researchMode: "deep_research", createdAt: "now" },
    terminalStatus: "legacy_fallback_used",
    finalAnswer: "Fallback answer",
    error: { code: "LEGACY" },
  });

  assert.equal(result.runId, "r");
  assert.equal(result.terminalStatus, "legacy_fallback_used");
  assert.equal(result.legacyFallbackUsed, true);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.divisionOutputs, {});
  assert.deepEqual(result.error, { code: "LEGACY" });
});
