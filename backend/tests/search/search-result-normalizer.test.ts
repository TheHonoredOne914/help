import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchResults, mergeSearchResultsByUrl } from "../../src/core/search/search-result-normalizer.js";

test("Serper organic and news results normalize to provider-attributed results", () => {
  const results = normalizeSearchResults("serper", {
    organic: [{ title: "PRS report", link: "https://prsindia.org/report?utm_source=x", snippet: "Parliamentary source" }],
    news: [{ title: "Court news", link: "https://livelaw.in/case", snippet: "Legal news", date: "May 1, 2026", source: "LiveLaw" }],
  }, { query: "India parliamentary accountability", bucketId: "policy_research" });

  assert.equal(results.length, 2);
  assert.equal(results[0].provider, "serper");
  assert.equal(results[0].url, "https://prsindia.org/report");
  assert.equal(results[0].metadata?.discoveredBy instanceof Array, true);
});

test("Exa results normalize semantic scores and merge duplicate provider provenance", () => {
  const serper = normalizeSearchResults("serper", {
    organic: [{ title: "Same source", link: "https://example.com/path?utm_campaign=x", snippet: "Keyword result" }],
  }, { query: "keyword" });
  const exa = normalizeSearchResults("exa", {
    results: [{ title: "Same source semantic", url: "https://example.com/path/", text: "Semantic result", score: 0.83 }],
  }, { query: "semantic" });

  const merged = mergeSearchResultsByUrl([...serper, ...exa]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].metadata?.discoveredBy, ["serper", "exa"]);
  assert.equal(merged[0].semanticScore, 0.83);
});
