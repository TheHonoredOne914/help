import test from "node:test";
import assert from "node:assert/strict";
import { createSearchRuntimeMetadata, searchWithFallback } from "../../src/core/search/search-provider-router.js";

test("search router keeps Serper and Exa before Tavily and merges duplicate provenance", async () => {
  const calls: string[] = [];
  const runtime = createSearchRuntimeMetadata();

  const results = await searchWithFallback({
    query: "India Parliament federalism",
    mode: "web",
    bucketId: "parliamentary_records",
    maxResults: 2,
  }, {
    mode: "deep_research",
    keys: { serper: "serper-test", exa: "exa-test", tavily: "tavily-test" },
    runtime,
    fetchFn: async (url) => {
      calls.push(String(url));
      if (String(url).includes("serper")) {
        return new Response(JSON.stringify({ organic: [{ title: "PRS", link: "https://prsindia.org/report?utm_source=x", snippet: "Keyword source" }] }), { status: 200 });
      }
      if (String(url).includes("exa")) {
        return new Response(JSON.stringify({ results: [{ title: "PRS semantic", url: "https://prsindia.org/report", text: "Semantic source", score: 0.9 }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [{ title: "PIB", url: "https://pib.gov.in/release", content: "Fallback source" }] }), { status: 200 });
    },
  });

  assert.match(calls[0], /serper/);
  assert.match(calls[1], /exa/);
  assert.match(calls[2], /tavily/);
  assert.equal(results.length, 2);
  assert.deepEqual(results.find((result) => result.url === "https://prsindia.org/report")?.metadata?.discoveredBy, ["serper", "exa"]);
  assert.deepEqual(runtime.searchProvidersUsed, ["serper", "exa", "tavily"]);
});

test("search router runs Exa when Serper is missing and reports missing providers without fake sources", async () => {
  const errors: string[] = [];
  const results = await searchWithFallback({
    query: "Supreme Court federalism India",
    mode: "semantic",
    maxResults: 1,
  }, {
    mode: "web_search",
    keys: { exa: "exa-test" },
    onProviderError: (error) => errors.push(error),
    fetchFn: async () => new Response(JSON.stringify({ results: [{ title: "Semantic", url: "https://example.com/semantic", text: "Semantic result", score: 0.8 }] }), { status: 200 }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].provider, "exa");
  assert.equal(errors.length, 0);
});
