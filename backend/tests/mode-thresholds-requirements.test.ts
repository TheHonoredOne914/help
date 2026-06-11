import test from "node:test";
import assert from "node:assert/strict";
import { MODE_THRESHOLDS } from "../src/core/quality-gate/mode-thresholds.js";

test("research mode thresholds match source and final-word requirements", () => {
  assert.equal(MODE_THRESHOLDS.fast_research.minCitedSources, 40);
  assert.equal(MODE_THRESHOLDS.fast_research.finalAnswerMinWords, 1000);

  assert.equal(MODE_THRESHOLDS.deep_research.minCitedSources, 80);
  assert.equal(MODE_THRESHOLDS.deep_research.finalAnswerMinWords, 2000);
  assert.equal(MODE_THRESHOLDS.deep_research.finalAnswerMaxWords, 3000);

  assert.equal(MODE_THRESHOLDS.council.minCitedSources, 180);
  assert.equal(MODE_THRESHOLDS.council.finalAnswerMinWords, 3000);
  assert.equal(MODE_THRESHOLDS.council.finalAnswerMaxWords, 5500);
});
