import test from "node:test";
import assert from "node:assert/strict";
import {
  extractPipelineMetadata,
  hasPipelineMetadata,
  stripPipelineMetadata,
} from "../../../frontend/src/lib/pipeline-metadata.ts";

test("frontend strips old backend marker before markdown rendering", () => {
  const content = `Final answer\n\n<!--BESTDEL_PIPELINE:{"assistantMessageId":1,"sources":[{"title":"Raw","url":"https://example.com"}]}-->`;
  const parsed = extractPipelineMetadata(content, 1);

  assert.equal(parsed.metadata?.assistantMessageId, 1);
  assert.equal(parsed.cleanContent, "Final answer");
  assert.doesNotMatch(parsed.cleanContent, /BESTDEL_PIPELINE|sources|example\.com/);
});

test("frontend strips canonical metadata and ignores wrong assistant message", () => {
  const content = [
    "Visible answer",
    "<!--BESTDEL_PIPELINE_START-->",
    JSON.stringify({ assistantMessageId: 99, runId: "run_wrong" }),
    "<!--BESTDEL_PIPELINE_END-->",
  ].join("\n");
  const parsed = extractPipelineMetadata(content, 42);

  assert.equal(parsed.metadata, null);
  assert.equal(parsed.cleanContent, "Visible answer");
});

test("frontend strips invalid metadata without exposing source JSON", () => {
  const content = "Answer\n<!--BESTDEL_PIPELINE:{\"sources\":[{\"url\":\"https://leak.test\"}]}";

  assert.equal(hasPipelineMetadata(content), true);
  assert.equal(stripPipelineMetadata(content), "Answer");
  assert.doesNotMatch(stripPipelineMetadata(content), /leak\.test|BESTDEL_PIPELINE/);
});
