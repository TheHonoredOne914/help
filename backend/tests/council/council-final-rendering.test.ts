import test from "node:test";
import assert from "node:assert/strict";
import { __councilTestHooks } from "../../src/services/anthropic-service.js";

const councillorOutput = {
  councillor_id: "C1_LEGAL",
  title: "Legal Councillor",
  perspective: "legal",
  status: "complete",
  summary: "Plain councillor summary without markdown source links.",
  raw_brief: "brief",
  key_claims: [{
    claim_id: "c1",
    text: "Session-internal source ids must not count unless rendered as citations.",
    source_ids: ["7", "8"],
    councillor_id: "C1_LEGAL",
    confidence: "high",
    stance: "supports",
    tags: [],
  }],
  evidence_pack_ids: [],
  sources_used: ["9"],
  started_at: "2026-06-06T00:00:00.000Z",
};

function makeSession() {
  return {
    session_id: "session-test",
    topic: "Council test topic",
    stance: "independent",
    status: "complete",
    councillors: {
      C1_LEGAL: councillorOutput,
      C2_ECONOMIC: null,
      C3_STRATEGIC: null,
      C4_SOCIAL: null,
      C5_HISTORICAL: null,
      C6_OPPOSITION: null,
    },
    seals: [],
    disputes: [],
    agreement_score: 0,
    verdict: null,
    terminalStatus: "completed",
    created_at: "2026-06-06T00:00:00.000Z",
    completed_at: "2026-06-06T00:00:01.000Z",
  } as any;
}

function makeRetrieval(count: number) {
  const now = "2026-06-06T00:00:00.000Z";
  return {
    rawResults: [],
    dedupedResults: [],
    filteredResults: [],
    enrichedResults: Array.from({ length: count }, (_, index) => ({
      id: `raw-${index + 1}`,
      title: `Evidence source ${index + 1}`,
      url: `https://example.com/source-${index + 1}`,
      domain: "example.com",
      snippet: `Specific evidence point ${index + 1} has enough policy detail for council citation expansion and final rendering checks.`,
      publishedDate: null,
      provider: "test",
      foundByQuery: "test query",
      bucketId: "policy_research",
      rawRank: index + 1,
      fetchedAt: now,
      bucketIds: ["policy_research"],
      foundByQueries: ["test query"],
      score: 1,
      sourceClass: "policy_research",
      scoreReasons: [],
      fullText: `Detailed retrieved evidence source ${index + 1} supports the council answer with concrete implementation, legal, social, strategic, and institutional analysis.`,
      textLength: 180,
      extractionQuality: "full",
      extractionProvider: "test",
      extractionStatus: "success",
      citationEligible: true,
    })),
    bucketCoverage: [],
    failedBuckets: [],
    weakBuckets: [],
    providerErrors: [],
    enrichmentFailures: [],
    topUpAttempts: [],
    sourceGaps: [],
    sourceGapReport: null,
    citationEligibleEstimate: count,
  } as any;
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function citedSourceIds(value: string): number[] {
  return [...new Set([...value.matchAll(/\[Source\s+(\d+)\]/gi)]
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

test("Council final answer appends cited evidence to meet post-render source and word gates", () => {
  const answer = __councilTestHooks.buildCouncilFinalAnswer(makeSession(), makeRetrieval(185));
  const citedIds = citedSourceIds(answer);

  assert.match(answer, /## Additional Evidence Bullets/);
  assert.equal(citedIds.length, 180);
  assert.equal(citedIds[0], 1);
  assert.equal(citedIds.at(-1), 180);
  assert.ok(wordCount(answer) >= 3000);
  assert.ok(wordCount(answer) <= 5500);
});

test("Council metadata uses requiredSources 180 and counts rendered final citations only", () => {
  const metadata = __councilTestHooks.buildCouncilMetadata(
    {
      runId: "run-test",
      requestId: "request-test",
      conversationId: 1,
      assistantMessageId: 2,
      queryHash: "hash",
      researchMode: "council",
      createdAt: "2026-06-06T00:00:00.000Z",
    },
    makeSession(),
    makeRetrieval(12),
    [
      "Rendered final answer cites [Source 1](https://example.com/source-1).",
      "It also cites [Source 2](https://example.com/source-2) and [Source 4](https://example.com/source-4).",
      "Session-only source ids 7, 8, and 9 are intentionally not markdown citations here.",
    ].join(" "),
  );

  assert.equal(metadata.sourceContract.requiredSources, 180);
  assert.equal(metadata.sourceContract.finalUniqueCitedSources, 3);
  assert.equal(metadata.citationStatus?.finalUniqueCitedSources, 3);
  assert.deepEqual(metadata.citationStatus?.citedSourceIds, [1, 2, 4]);
  assert.equal(metadata.sources?.find((source) => source.sourceId === 7)?.cited, false);
});
