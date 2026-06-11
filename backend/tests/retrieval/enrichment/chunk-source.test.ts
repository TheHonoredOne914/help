import test from "node:test";
import assert from "node:assert/strict";
import { chunkCleanedText } from "../../../src/core/retrieval/enrichment/chunk-source.js";

test("chunkCleanedText splits semantic paragraphs and preserves indexes", () => {
  const first = "Supreme Court Article 21 privacy holding ".repeat(5);
  const second = "Parliamentary question and ministry accountability ".repeat(5);
  const chunks = chunkCleanedText(`${first}\n\n${second}`, "Article 21 privacy", "https://example.com/source");

  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map((chunk) => chunk.index), [0, 1]);
  assert.ok(chunks.every((chunk) => chunk.charLength >= 80));
  assert.ok(chunks.every((chunk) => chunk.charLength <= 600));
  assert.ok(chunks.every((chunk) => chunk.url === "https://example.com/source"));
});

test("chunkCleanedText handles long and empty text safely", () => {
  const chunks = chunkCleanedText("Sentence about Parliament and federalism. ".repeat(80), "Parliament federalism");

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.charLength <= 600));
  assert.deepEqual(chunkCleanedText("   ", "query"), []);
});
