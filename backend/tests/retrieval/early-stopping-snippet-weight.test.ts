import test from "node:test";
import assert from "node:assert/strict";
import { weightForEvidenceSource } from "../../src/core/retrieval/early-stopping.js";

test("citation-eligible snippets count as limited weight 0.35", () => {
  assert.equal(weightForEvidenceSource({ extractionQuality: "snippet", citationEligible: true }), 0.35);
  assert.equal(weightForEvidenceSource({ extractionQuality: "snippet", citationEligible: false }), 0);
});
