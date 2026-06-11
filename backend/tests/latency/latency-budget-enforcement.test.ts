import test from "node:test";
import assert from "node:assert/strict";
import { createLatencyBudget } from "../../src/core/latency/latency-budget.js";

test("over-budget fast retrieval forces compressed generation behavior", () => {
  let now = 0;
  const budget = createLatencyBudget("fast_research", () => now);
  budget.startStage("retrieval");
  now = 29_500;
  budget.endStage("retrieval");

  assert.ok(budget.getCompressionLevel("generation") >= 1);
  assert.equal(budget.shouldSkipOptionalStage("repair"), true);
  assert.ok(budget.remainingStageBudget("generation") <= budget.generationBudgetMs);
});
