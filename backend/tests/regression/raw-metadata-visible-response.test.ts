import test from "node:test";
import assert from "node:assert/strict";
import { embedPipelineMetadata, stripPipelineMetadata } from "../../src/core/pipeline/pipeline-metadata.js";
import { evaluateSourceContract } from "../../src/core/evidence/source-contract.js";
import { decideFinalResearchStatus } from "../../src/core/pipeline/final-status.js";
import { classifySource } from "../../src/core/retrieval/source-scoring.js";

test("raw pipeline metadata never remains in visible response content", () => {
  const visible = stripPipelineMetadata(embedPipelineMetadata("Answer body", {
    runId: "run",
    requestId: "req",
    conversationId: 1,
    assistantMessageId: 2,
    queryHash: "hash",
    researchMode: "deep_research",
    terminalStatus: "failed",
    coreGenerationUsed: false,
    legacyFallbackUsed: true,
    liveRetrievalUsed: true,
    sourceContract: {
      requiredSources: 20,
      citationEligibleSources: 15,
      finalUniqueCitedSources: 15,
      passedStrict: false,
      passedWithSourceGaps: true,
      passed: true,
      status: "passed_with_source_gaps",
      reason: "Gap.",
    },
    sources: [{ title: "Should not leak", url: "https://example.com/raw-json" }],
  }));

  assert.equal(visible, "Answer body");
  assert.doesNotMatch(visible, /BESTDEL_PIPELINE|raw-json|sourceContract/);
});

test("failed gates and source gaps cannot be normal completed", () => {
  const sourceContract = evaluateSourceContract({
    mode: "deep_research",
    requiredSources: 20,
    citationEligibleSources: 15,
    finalUniqueCitedSources: 15,
    sourceGapReport: { explanation: "15/20 available." },
    categoryScores: { sourceContract: 0 },
  });

  assert.equal(sourceContract.status, "passed_with_source_gaps");
  assert.equal(sourceContract.passedStrict, false);

  assert.notEqual(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract,
    sourceGapReport: { explanation: "15/20 available." },
    qualityGate: { passed: false, score: 78, repairRequired: true, categoryScores: { sourceContract: 0 } },
    citationStatus: { finalUniqueCitedSources: 15 },
  }), "completed");
});

test("social media never classifies as official government", () => {
  assert.equal(classifySource("facebook.com"), "social_media");
  assert.notEqual(classifySource("facebook.com"), "official_government");
});
