import test from "node:test";
import assert from "node:assert/strict";
import { cerebrasEvidenceReducer } from "../../../src/core/retrieval/enrichment/reducers/cerebras-evidence-reducer.js";
import type { EnrichedSource, ScoredChunk } from "../../../src/core/retrieval/enrichment/types.js";

const source: EnrichedSource = {
  title: "Supreme Court privacy ruling",
  url: "https://main.sci.gov.in/privacy",
  domain: "main.sci.gov.in",
  fullText: "Supreme Court Article 21 privacy holding.",
  snippet: "privacy",
  textLength: 40,
  extractionMethod: "readability_fetch",
  extractionStatus: "success",
  extractionQuality: "high",
  citationEligible: true,
};

const chunks: ScoredChunk[] = [
  { index: 0, text: "Supreme Court Article 21 privacy holding.", charLength: 41, relevanceScore: 9 },
];

test("cerebras reducer falls back locally when key is missing", async () => {
  let calls = 0;
  const card = await cerebrasEvidenceReducer.reduce(source, chunks, "Article 21 privacy", {
    cerebrasEnabled: true,
    cerebrasApiKey: "",
    fetchFn: (async () => {
      calls += 1;
      return new Response("should not call");
    }) as typeof fetch,
  });

  assert.equal(calls, 0);
  assert.equal(card.reducerName, "local");
  assert.equal(card.topChunks.length, 1);
});

test("cerebras reducer falls back after 429 retries", async () => {
  let calls = 0;
  const card = await cerebrasEvidenceReducer.reduce(source, chunks, "Article 21 privacy", {
    cerebrasEnabled: true,
    cerebrasApiKey: "cb-key",
    cerebrasRetryDelayMs: 0,
    fetchFn: (async () => {
      calls += 1;
      return new Response("rate limited", { status: 429 });
    }) as typeof fetch,
  });

  assert.equal(calls, 3);
  assert.equal(card.reducerName, "local");
});

test("cerebras reducer falls back on invalid JSON", async () => {
  const card = await cerebrasEvidenceReducer.reduce(source, chunks, "Article 21 privacy", {
    cerebrasEnabled: true,
    cerebrasApiKey: "cb-key",
    fetchFn: (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "not json" } }],
    }))) as typeof fetch,
  });

  assert.equal(card.reducerName, "local");
});

test("cerebras reducer stores valid verified evidence items", async () => {
  const card = await cerebrasEvidenceReducer.reduce(source, chunks, "Article 21 privacy", {
    cerebrasEnabled: true,
    cerebrasApiKey: "cb-key",
    fetchFn: (async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify([{ claim: "privacy", snippet: "Article 21 privacy holding", relevance: "high" }]) } }],
    }))) as typeof fetch,
  });

  assert.equal(card.reducerName, "cerebras");
  assert.equal(card.evidenceItems?.length, 1);
});

test("cerebras reducer rejects unverified evidence items", async () => {
  const card = await cerebrasEvidenceReducer.reduce(source, chunks, "Article 21 privacy", {
    cerebrasEnabled: true,
    cerebrasApiKey: "cb-key",
    fetchFn: (async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify([{ claim: "invented", snippet: "not present in source", relevance: "low" }]) } }],
    }))) as typeof fetch,
  });

  assert.equal(card.reducerName, "cerebras");
  assert.deepEqual(card.evidenceItems, []);
});
