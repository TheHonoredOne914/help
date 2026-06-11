import test from "node:test";
import assert from "node:assert/strict";
import { createLatencyBudget } from "../../src/core/latency/latency-budget.js";

test("latency budgets scale by research mode", () => {
  assert.equal(createLatencyBudget("fast_research").totalBudgetMs, 90_000);
  assert.equal(createLatencyBudget("council").providerCallTimeoutMs, 45_000);
  assert.ok(createLatencyBudget("deep_research").sourceUsageBudgetMs > createLatencyBudget("fast_research").sourceUsageBudgetMs);
});

test("Council latency budget preserves 180-source enrichment capacity", () => {
  const budget = createLatencyBudget("council");
  const capacity = Math.floor(budget.enrichmentBudgetMs / budget.extractionTimeoutMs) * budget.maxConcurrentEnrichments;

  assert.equal(budget.enrichmentBudgetMs, 480_000);
  assert.equal(budget.maxConcurrentEnrichments, 16);
  assert.ok(capacity >= 180);
});

test("latency manager records stage events and early stop", () => {
  let now = 0;
  const budget = createLatencyBudget("fast_research", () => now);
  budget.startStage("retrieval");
  now = 91_000;
  budget.endStage("retrieval");
  assert.equal(budget.shouldEarlyStop(), true);
  assert.ok(budget.events.some((event) => event.type === "latency_stage_started"));
  assert.ok(budget.events.some((event) => event.type === "latency_stage_completed"));
  assert.ok(budget.events.some((event) => event.type === "latency_early_stop"));
});
