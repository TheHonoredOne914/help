import test from "node:test";
import assert from "node:assert/strict";
import { extractPipelineMetadata } from "./pipeline-metadata";

const content = `Answer.

<!--BESTDEL_PIPELINE_START-->
{"runId":"run-1","conversationId":44,"assistantMessageId":55,"terminalStatus":"completed"}
<!--BESTDEL_PIPELINE_END-->`;

test("pipeline metadata accepts the full run identity tuple", () => {
  const result = extractPipelineMetadata(content, {
    runId: "run-1",
    conversationId: 44,
    assistantMessageId: 55,
  });

  assert.equal(result.metadata?.runId, "run-1");
});

test("pipeline metadata rejects mismatched run identity fields", () => {
  assert.equal(extractPipelineMetadata(content, {
    runId: "run-2",
    conversationId: 44,
    assistantMessageId: 55,
  }).metadata, null);
  assert.equal(extractPipelineMetadata(content, {
    runId: "run-1",
    conversationId: 45,
    assistantMessageId: 55,
  }).metadata, null);
  assert.equal(extractPipelineMetadata(content, {
    runId: "run-1",
    conversationId: 44,
    assistantMessageId: 56,
  }).metadata, null);
});
