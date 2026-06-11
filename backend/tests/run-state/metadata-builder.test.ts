import test from "node:test";
import assert from "node:assert/strict";
import { buildPipelineMetadataFromSnapshot } from "../../src/core/run-state/metadata-builder.js";
import { buildResultSnapshot } from "../../src/core/run-state/result-snapshot.js";

test("metadata includes division outputs, reports, fallback flags, and terminal status", () => {
  const snapshot = buildResultSnapshot({
    runIdentity: { runId: "r", requestId: "q", conversationId: 1, assistantMessageId: 2, queryHash: "h", researchMode: "fast_research", createdAt: "now" },
    finalAnswer: "Answer [1].",
    terminalStatus: "completed_with_source_gaps",
    sources: [{ sourceId: 1, title: "Source", url: "https://example.com" }],
    citationReport: { citedSourceIds: [1], finalUniqueCitedSources: 1, totalLinkedCitations: 1, citationCoverage: 1 },
    sourceContract: { requiredSources: 2, citationEligibleSources: 1, finalUniqueCitedSources: 1, passedStrict: false, passedWithSourceGaps: true, passed: true, status: "passed_with_source_gaps", reason: "limited evidence" },
    sourceGapReport: { explanation: "limited evidence" },
    qualityGateReport: { passed: true, score: 80, repairRequired: false },
    repairPasses: [{ pass: 1 }],
    sourceUsageValidationReports: [{ role: "D1" }],
    divisionOutputs: { D1: "output" },
    fallbackUsed: true,
    fallbackReason: "degraded provider",
  });

  const metadata = buildPipelineMetadataFromSnapshot(snapshot);

  assert.equal(metadata.terminalStatus, "completed_with_source_gaps");
  assert.deepEqual(metadata.divisionOutputs, { D1: "output" });
  assert.deepEqual(metadata.citationReport, snapshot.citationReport);
  assert.deepEqual(metadata.qualityGateReport, snapshot.qualityGateReport);
  assert.equal(metadata.fallbackUsed, true);
});
