import test from "node:test";
import assert from "node:assert/strict";
import { buildResultSnapshot } from "../../src/core/run-state/result-snapshot.js";

test("result snapshot keeps cited source ids and source metadata atomic", () => {
  const snapshot = buildResultSnapshot({
    runIdentity: {
      runId: "run-1",
      requestId: "req-1",
      conversationId: 10,
      assistantMessageId: 20,
      queryHash: "hash",
      researchMode: "deep_research",
      createdAt: "2026-05-30T00:00:00.000Z",
    },
    finalAnswer: "Answer using [1].",
    terminalStatus: "completed",
    sources: [
      { sourceId: 1, title: "PRS brief", url: "https://prsindia.org/x" },
      { sourceId: 2, title: "Unused", url: "https://example.com/y" },
    ],
    citationReport: {
      finalUniqueCitedSources: 1,
      totalLinkedCitations: 1,
      citedSourceIds: [1],
      citationCoverage: 0.5,
    },
    sourceContract: {
      requiredSources: 1,
      citationEligibleSources: 2,
      finalUniqueCitedSources: 1,
      passedStrict: true,
      passedWithSourceGaps: false,
      passed: true,
      status: "passed",
      reason: "ok",
    },
    qualityGateReport: { passed: true, score: 90, repairRequired: false, automaticFailures: [], warnings: [] },
    divisionOutputs: new Map([["D1", "Division text"]]),
  });

  assert.deepEqual(snapshot.citedSourceIds, [1]);
  assert.equal(snapshot.sources.find((source) => source.sourceId === 1)?.cited, true);
  assert.equal(snapshot.sources.find((source) => source.sourceId === 2)?.cited, false);
  assert.deepEqual(snapshot.divisionOutputs, { D1: "Division text" });
});
