import test from "node:test";
import assert from "node:assert/strict";
import { decideRunTerminalStatus, selectCanonicalRunTerminalStatus } from "../../src/core/run-state/terminal-status-decider.js";

const strictContract = {
  requiredSources: 2,
  citationEligibleSources: 3,
  finalUniqueCitedSources: 2,
  passedStrict: true,
  passedWithSourceGaps: false,
  passed: true,
  status: "passed" as const,
  reason: "Strict target met.",
};

test("empty or metadata-only final answer fails even when gates pass", () => {
  const base = {
    mode: "deep_research" as const,
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: strictContract,
    qualityGate: { passed: true, score: 90, repairRequired: false },
    citationStatus: { finalUniqueCitedSources: 2 },
  };

  assert.deepEqual(decideRunTerminalStatus({
    ...base,
    visibleAnswer: "   ",
  }), {
    terminalStatus: "failed",
    errorCode: "EMPTY_FINAL_ANSWER",
    visibleAnswer: "",
  });

  assert.deepEqual(decideRunTerminalStatus({
    ...base,
    visibleAnswer: "<!--BESTDEL_PIPELINE_START-->{\"terminalStatus\":\"completed\"}<!--BESTDEL_PIPELINE_END-->",
  }), {
    terminalStatus: "failed",
    errorCode: "EMPTY_FINAL_ANSWER",
    visibleAnswer: "",
  });
});

test("non-empty answer delegates to canonical final status policy", () => {
  assert.equal(decideRunTerminalStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: strictContract,
    qualityGate: { passed: true, score: 90, repairRequired: false },
    citationStatus: { finalUniqueCitedSources: 2 },
    visibleAnswer: "A grounded final answer [1].",
  }).terminalStatus, "completed");
});

test("route finalization must use terminal decision even without an error code", () => {
  const decision = decideRunTerminalStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: {
      ...strictContract,
      passed: false,
      passedStrict: false,
      status: "failed",
      reason: "Source contract failed.",
    },
    qualityGate: { passed: true, score: 90, repairRequired: false },
    citationStatus: { finalUniqueCitedSources: 2 },
    visibleAnswer: "A visible answer with citations [1].",
  });

  assert.equal(decision.errorCode, undefined);
  assert.equal(decision.terminalStatus, "failed");
  assert.equal(selectCanonicalRunTerminalStatus(decision, "completed"), "failed");
});
