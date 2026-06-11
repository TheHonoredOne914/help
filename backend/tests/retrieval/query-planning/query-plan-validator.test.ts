import test from "node:test";
import assert from "node:assert/strict";
import { validateQueryPlan } from "../../../src/core/retrieval/query-planning/query-plan-validator.js";

test("query plan validator rejects generic topic-free queries", () => {
  const plan = validateQueryPlan({
    requestId: "validator",
    agendaContract: {} as any,
    buckets: [],
    retryPolicy: { retries: 0, backoffMs: 0 },
    topUpPolicy: { minCitationEligibleSources: 0, minFinalUniqueCitedSources: 0, weakBucketTopUp: false },
    queries: [
      { id: "1", bucketId: "government_official", query: "India parliament official source", priority: "broad_discovery", expectedDomains: [], maxResultsPerQuery: 5, timeoutMs: 1000 },
      { id: "2", bucketId: "court_legal", query: "India Supreme Court judgment", priority: "broad_discovery", expectedDomains: [], maxResultsPerQuery: 5, timeoutMs: 1000 },
      { id: "3", bucketId: "policy_research", query: "ONDC small sellers parliamentary policy India 2026 2026", priority: "broad_discovery", expectedDomains: [], maxResultsPerQuery: 5, timeoutMs: 1000 },
    ],
  } as any);

  assert.deepEqual(plan.queries.map((query) => query.query), [
    "ONDC small sellers parliamentary policy India 2026",
  ]);
});
