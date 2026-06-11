import { test } from "node:test";
import assert from "node:assert/strict";

import { searchWebDeep } from "../src/lib/web-search.ts";

const hasLiveSearchKey = Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY || process.env.SERPER_KEY);

const SEARCH_TEST_CASES = [
  {
    query: "Article 356 President's Rule India constitutional validity Supreme Court",
    topic: "governance" as const,
    expectedSourceTypes: ["government_india", "court_judgement"],
    minCount: 5,
    forbiddenDomains: ["reddit.com", "quora.com", "medium.com"],
  },
  {
    query: "UAPA activists detained India 2022 2023 2024 human rights",
    topic: "democracy_civil_liberties" as const,
    expectedSourceTypes: ["international_research"],
    minCount: 5,
    forbiddenDomains: ["reddit.com"],
  },
];

for (const tc of SEARCH_TEST_CASES) {
  test(`Web search quality: ${tc.query.slice(0, 50)}`, { skip: hasLiveSearchKey ? false : "Set a search API key to run live search quality tests" }, async () => {
    const results = await searchWebDeep(tc.query, {
      tavilyKey: process.env.TAVILY_API_KEY,
      braveKey: process.env.BRAVE_API_KEY,
      serperKey: process.env.SERPER_KEY,
    }, tc.topic);

    assert.ok(results.length >= tc.minCount, `Expected >=${tc.minCount} results, got ${results.length}`);
    const forbidden = results.filter((result) => tc.forbiddenDomains.some((domain) => result.url.toLowerCase().includes(domain)));
    assert.equal(forbidden.length, 0, `Forbidden domains in results: ${forbidden.map((r) => r.url).join(", ")}`);
    assert.ok(tc.expectedSourceTypes.some((type) => results.some((result) => result.sourceType === type)));
  });
}
