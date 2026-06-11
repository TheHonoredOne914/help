import test from "node:test";
import assert from "node:assert/strict";
import { extractQueryTerms, scoreChunks } from "../../../src/core/retrieval/enrichment/local-relevance-scorer.js";

test("scoreChunks prioritizes query, Indian legal, and numeric evidence", () => {
  const chunks = [
    { index: 0, text: "Cookie policy subscribe advertisement newsletter navigation footer.", charLength: 66 },
    { index: 1, text: "The Supreme Court held that Article 21 requires proportionality and affected 142 petitions.", charLength: 91 },
    { index: 2, text: "A general opinion article mentions India without the privacy holding.", charLength: 67 },
  ];

  const scored = scoreChunks(chunks, extractQueryTerms("Supreme Court Article 21 privacy petitions"));

  assert.equal(scored[0].index, 1);
  assert.ok(scored[0].relevanceScore > scored[1].relevanceScore);
  assert.ok(scored.at(-1)!.relevanceScore < 1);
});

test("scoreChunks returns descending relevance order", () => {
  const scored = scoreChunks([
    { index: 0, text: "Parliament Parliament Parliament ministry accountability.", charLength: 52 },
    { index: 1, text: "ministry accountability.", charLength: 24 },
  ], new Set(["parliament", "ministry", "accountability"]));

  assert.deepEqual(scored.map((chunk) => chunk.index), [0, 1]);
});
