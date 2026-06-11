import test from "node:test";
import assert from "node:assert/strict";
import { getSearchProviderOrder, getExtractionProviderOrder } from "../../src/core/search/search-fallback-policy.js";

test("fast and web research use Serper then Exa before Tavily fallback", () => {
  assert.deepEqual(getSearchProviderOrder("fast_research", { serper: true, exa: true, tavily: true, brave: true }), ["serper", "exa", "tavily", "brave"]);
  assert.deepEqual(getSearchProviderOrder("web_search", { serper: true, exa: true, tavily: true }), ["serper", "exa", "tavily"]);
});

test("deep and strict research combine Serper and Exa before fallback providers", () => {
  assert.deepEqual(getSearchProviderOrder("deep_research", { serper: true, exa: true, tavily: true }), ["serper", "exa", "tavily"]);
  assert.deepEqual(getSearchProviderOrder("council", { exa: true, tavily: true }), ["exa", "tavily"]);
});

test("extraction prefers Firecrawl then Jina then snippet fallback", () => {
  assert.deepEqual(getExtractionProviderOrder({ firecrawl: true, jina: true }), ["firecrawl", "jina", "snippet_fallback"]);
  assert.deepEqual(getExtractionProviderOrder({ firecrawl: false, jina: true }), ["jina", "snippet_fallback"]);
});
