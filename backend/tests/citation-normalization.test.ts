import test from "node:test";
import assert from "node:assert/strict";

import { computeCitationCoverage, normalizeSourceCitations } from "../src/lib/citation-normalizer.ts";
import { countCitations } from "../src/lib/rag.ts";
import type { SearchResult } from "../src/lib/types.ts";

function source(id: number): SearchResult {
  return {
    title: `Source ${id}`,
    url: `https://example.com/source-${id}`,
    snippet: `Snippet ${id}`,
    engine: "tavily",
    score: 8,
    sourceType: "general",
  };
}

test("normalizes bare numeric and grouped source citations into counted source links", () => {
  const sources = Array.from({ length: 5 }, (_, i) => source(i + 1));
  const draft = [
    "India's democracy score declined according to Freedom House [1].",
    "The pattern is discussed across watchdog sources [Source 3, 4, 5].",
    "V-Dem also describes democratic decline [Source 2].",
  ].join("\n");

  const normalized = normalizeSourceCitations(draft, sources);

  assert.match(normalized, /\[Source 1\]\(https:\/\/example\.com\/source-1\)/);
  assert.match(normalized, /\[Source 2\]\(https:\/\/example\.com\/source-2\)/);
  assert.match(
    normalized,
    /\[Source 3\]\(https:\/\/example\.com\/source-3\), \[Source 4\]\(https:\/\/example\.com\/source-4\), \[Source 5\]\(https:\/\/example\.com\/source-5\)/,
  );
  assert.equal(countCitations(normalized), 5);
  assert.deepEqual(computeCitationCoverage(normalized, 5), {
    coveragePct: 100,
    citedIds: [1, 2, 3, 4, 5],
    missingIds: [],
    eligibleIds: [1, 2, 3, 4, 5],
  });
});
