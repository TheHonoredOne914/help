import test from "node:test";
import assert from "node:assert/strict";
import { dedupeByContentSimilarity } from "../../src/core/retrieval/source-deduper.js";

test("content similarity dedupe removes near duplicates and keeps higher authority", () => {
  const kept = dedupeByContentSimilarity([
    { url: "https://low.example/a", title: "Supreme Court VVPAT judgment India election", snippet: "The Supreme Court VVPAT judgment India election process and voter verification safeguards.", score: 40 },
    { url: "https://high.example/b", title: "Supreme Court VVPAT judgment India election", snippet: "The Supreme Court VVPAT judgment India election process and voter verification safeguards.", score: 95 },
    { url: "https://other.example/c", title: "RSF press freedom India rank", snippet: "World Press Freedom Index India rank and media environment.", score: 80 },
  ]);

  assert.equal(kept.length, 2);
  assert.equal(kept[0].url, "https://high.example/b");
  assert.deepEqual(kept[0].duplicateOf, ["https://low.example/a"]);
});
