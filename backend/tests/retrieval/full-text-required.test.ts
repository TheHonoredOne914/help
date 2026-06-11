import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { runBucketedRetrieval } from "../../src/core/retrieval/bucketed-retrieval.js";

test("fullTextRequired bucket does not count snippet-only extraction as strong citation evidence", async () => {
  const contract = buildAgendaContract({ requestId: "article-356", originalUserQuery: "Article 356 and federalism in India" });
  const plan = buildBucketedQueryPlan(contract, "fast_research");
  const courtPlan = {
    ...plan,
    queries: plan.queries.filter((query) => query.bucketId === "court_legal").slice(0, 2),
    buckets: plan.buckets.filter((bucket) => bucket.id === "court_legal"),
  };

  const result = await runBucketedRetrieval(courtPlan, {
    mode: "fast_research",
    live: false,
    allowMock: true,
    maxSourcesToEnrich: 4,
    enrichFetchFn: async () => new Response("", { status: 503 }),
  });

  const snippetOnlyCourt = result.enrichedResults.find((source) => source.bucketIds.includes("court_legal"));
  assert.ok(snippetOnlyCourt);
  assert.equal(snippetOnlyCourt.extractionQuality === "snippet" || snippetOnlyCourt.extractionQuality === "failed", true);
  assert.equal(snippetOnlyCourt.citationEligible, false);
});
