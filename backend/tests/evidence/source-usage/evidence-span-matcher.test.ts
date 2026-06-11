import test from "node:test";
import assert from "node:assert/strict";
import { findEvidenceSpanForText } from "../../../src/core/evidence/source-usage/evidence-span-matcher.js";
import { makeRegistry, source } from "./helpers.js";

test("evidence span matcher prefers top chunks and rejects single-token matches", () => {
  const { registry } = makeRegistry([source(1, {
    fullText: "A separate sentence. The ministry published federalism accountability data for Parliament.",
    topChunks: [{ text: "The ministry published federalism accountability data for Parliament.", score: 98, chunkIndex: 5 }],
    keyFacts: ["The ministry published federalism accountability data for Parliament."],
  })]);
  const sourceOne = registry.getSource(1)!;

  const span = findEvidenceSpanForText("ministry published federalism accountability data", sourceOne);
  const weak = findEvidenceSpanForText("ministry invented unrelated secret order", sourceOne);

  assert.equal(span?.chunkIndex, 5);
  assert.equal(weak, null);
});
