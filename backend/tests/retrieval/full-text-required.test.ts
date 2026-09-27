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
  // Failed extracts stay ineligible; substantive weak snippets may be limited-eligible but stay flagged.
  if (snippetOnlyCourt.extractionQuality === "failed") {
    assert.equal(snippetOnlyCourt.citationEligible, false);
  } else if (snippetOnlyCourt.citationEligible) {
    assert.match((snippetOnlyCourt.limitations ?? []).join(" "), /Snippet-only|full text/i);
  }
});

test("fullTextRequired bucket keeps substantive weak snippets citation-eligible when enrichment approved them", async () => {
  const contract = buildAgendaContract({
    requestId: "eci-ads",
    originalUserQuery: "Election Commission regulate online political advertising deepfakes platform transparency India",
  });
  const plan = buildBucketedQueryPlan(contract, "fast_research");
  const electoralPlan = {
    ...plan,
    queries: plan.queries.filter((query) => query.bucketId === "electoral_integrity").slice(0, 2),
    buckets: plan.buckets.filter((bucket) => bucket.id === "electoral_integrity"),
  };

  const substantiveSnippet = [
    "The Election Commission of India issued detailed guidance on deepfakes, synthetic media,",
    "and online political advertising during elections, urging platforms to label paid political content",
    "and take down violative AI-generated material within prescribed timelines.",
  ].join(" ");

  const result = await runBucketedRetrieval(electoralPlan, {
    mode: "fast_research",
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-test-key" },
    maxSourcesToEnrich: 3,
    maxResultsPerQuery: 1,
    fetchFn: async () => new Response(JSON.stringify({
      results: [{
        title: "ECI advisory on deepfakes and online political advertising",
        url: "https://eci.gov.in/advisory-deepfakes-ads",
        content: substantiveSnippet,
      }],
    }), { status: 200 }),
    enrichFetchFn: async () => new Response("", { status: 503 }),
  });

  const electoral = result.enrichedResults.find((source) => source.bucketIds.includes("electoral_integrity"));
  assert.ok(electoral);
  assert.equal(electoral.extractionQuality, "snippet");
  assert.equal(electoral.citationEligible, true);
  assert.match((electoral.limitations ?? []).join(" "), /Snippet-only|full text/i);
});
