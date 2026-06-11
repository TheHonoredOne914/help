import test from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_METADATA_END,
  PIPELINE_METADATA_START,
  embedPipelineMetadata,
  extractPipelineMetadata,
  hasPipelineMetadata,
  stripPipelineMetadata,
} from "../../src/core/pipeline/pipeline-metadata.js";

const baseMeta = {
  runId: "run_123",
  requestId: "req_123",
  conversationId: 7,
  assistantMessageId: 42,
  queryHash: "hash",
  researchMode: "deep_research" as const,
  terminalStatus: "completed_with_source_gaps" as const,
  coreGenerationUsed: true,
  legacyFallbackUsed: false,
  liveRetrievalUsed: true,
  sourceContract: {
    requiredSources: 20,
    citationEligibleSources: 15,
    finalUniqueCitedSources: 15,
    passedStrict: false,
    passedWithSourceGaps: true,
    passed: true,
    status: "passed_with_source_gaps" as const,
    reason: "Fewer than required sources were available.",
  },
};

test("serializes metadata with the canonical multiline marker", () => {
  const embedded = embedPipelineMetadata("clean answer", baseMeta);

  assert.match(embedded, new RegExp(PIPELINE_METADATA_START));
  assert.match(embedded, new RegExp(PIPELINE_METADATA_END));
  assert.doesNotMatch(embedded, /<!--BESTDEL_PIPELINE:/);
  assert.equal(extractPipelineMetadata(embedded)?.runId, "run_123");
  assert.equal(stripPipelineMetadata(embedded), "clean answer");
});

test("old one-line metadata marker parses and strips safely", () => {
  const old = `visible\n\n<!--BESTDEL_PIPELINE:${JSON.stringify(baseMeta)}-->`;

  assert.equal(hasPipelineMetadata(old), true);
  assert.equal(extractPipelineMetadata(old)?.terminalStatus, "completed_with_source_gaps");
  assert.equal(stripPipelineMetadata(old), "visible");
});

test("invalid metadata strips without exposing raw JSON or comment text", () => {
  const bad = `answer\n<!--BESTDEL_PIPELINE_START-->\n{"sources":[{"url":"https://example.com"}]\n<!--BESTDEL_PIPELINE_END-->`;

  assert.equal(extractPipelineMetadata(bad), null);
  const stripped = stripPipelineMetadata(bad);
  assert.equal(stripped, "answer");
  assert.doesNotMatch(stripped, /BESTDEL_PIPELINE|sources|example\.com/);
});
