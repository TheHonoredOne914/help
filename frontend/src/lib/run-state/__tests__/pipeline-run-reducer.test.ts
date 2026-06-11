import test from "node:test";
import assert from "node:assert/strict";
import { initialPipelineState, pipelineReducer } from "@/hooks/use-pipeline-state";

test("COMPLETE does not re-derive backend completed_with_source_gaps from sourceGapReport", () => {
  const running = pipelineReducer(initialPipelineState, {
    type: "SET_ACTIVE_RUN",
    runId: "run-1",
    conversationId: 1,
    assistantMessageId: 2,
  });
  const withSourceGap = pipelineReducer(running, {
    type: "SOURCE_GAP_REPORT",
    report: {
      requiredUniqueSources: 20,
      availableCitationEligibleSources: 12,
      failedBuckets: [],
      weakBuckets: [],
      explanation: "Partial evidence.",
    },
  });

  const completed = pipelineReducer(withSourceGap, { type: "COMPLETE" });

  assert.equal(completed.runStatus, "running");
  assert.equal(completed.isComplete, false);
});
