import test from "node:test";
import assert from "node:assert/strict";
import { RESEARCH_LIMITS, type ResearchMode } from "../../src/core/config/research-mode.js";
import { createLatencyBudget } from "../../src/core/latency/latency-budget.js";
import { classifyProviderError } from "../../src/core/search/search-provider-errors.js";
import { withEnrichmentBudget } from "../../src/core/retrieval/bucketed-retrieval.js";

test("enrichment capacity >= maxSourcesToEnrich for all modes", () => {
  const modes: ResearchMode[] = ["fast_research", "deep_research", "deep_research", "council"];

  for (const mode of modes) {
    const limits = RESEARCH_LIMITS[mode];
    const budget = createLatencyBudget(mode);

    // Effective crawl capacity = floor(enrichmentBudgetMs / extractionTimeoutMs) * enrichmentConcurrency
    const capacity = Math.floor(budget.enrichmentBudgetMs / budget.extractionTimeoutMs) * budget.maxConcurrentEnrichments;

    assert.ok(
      capacity >= limits.maxSourcesToEnrich,
      `${mode}: capacity ${capacity} (budget:${budget.enrichmentBudgetMs}/timeout:${budget.extractionTimeoutMs}*concurrency:${budget.maxConcurrentEnrichments}) should be >= maxSourcesToEnrich ${limits.maxSourcesToEnrich}`,
    );
  }
});

test("extractionTimeoutMs is properly set for all modes", () => {
  assert.equal(createLatencyBudget("fast_research").extractionTimeoutMs, 6000);
  assert.equal(createLatencyBudget("deep_research").extractionTimeoutMs, 8000);
  assert.equal(createLatencyBudget("deep_research").extractionTimeoutMs, 10000);
  assert.equal(createLatencyBudget("council").extractionTimeoutMs, 12000);
});

test("enrichment budget is reconciled between research-mode.ts and latency-budget.ts", () => {
  // The enrichmentBudgetMs should be consistent
  assert.equal(RESEARCH_LIMITS.fast_research.enrichmentBudgetMs, createLatencyBudget("fast_research").enrichmentBudgetMs);
  assert.equal(RESEARCH_LIMITS.deep_research.enrichmentBudgetMs, createLatencyBudget("deep_research").enrichmentBudgetMs);
  assert.equal(RESEARCH_LIMITS.deep_research.enrichmentBudgetMs, createLatencyBudget("deep_research").enrichmentBudgetMs);
  assert.equal(RESEARCH_LIMITS.council.enrichmentBudgetMs, createLatencyBudget("council").enrichmentBudgetMs);
});

test("classifyProviderError distinguishes budget abort from per-call timeout", () => {
  // Budget abort (enrichment budget exceeded) should be classified as "aborted"
  assert.equal(classifyProviderError(new Error("Enrichment aborted: budget exceeded")), "aborted");
  assert.equal(classifyProviderError(new Error("fetch failed: budget exceeded for extraction")), "aborted");

  // Real per-call timeout should be classified as "timeout"
  assert.equal(classifyProviderError(new Error("fetch failed: timeout of 6000ms exceeded")), "timeout");
  assert.equal(classifyProviderError(new Error("AbortError: The operation was aborted")), "timeout");
  assert.equal(classifyProviderError(new Error("timeout: timed out after 12000ms")), "timeout");

  // Other errors should not be affected
  assert.equal(classifyProviderError(new Error("401 unauthorized")), "invalid_key");
  assert.equal(classifyProviderError(new Error("429 rate limit exceeded")), "rate_limited");
  assert.equal(classifyProviderError(new Error("network error")), "network_error");
});

test("withEnrichmentBudget handles N sources with adequate budget and concurrency", async () => {
  // Test that with N sources, adequate per-call timeout, and adequate concurrency,
  // all N sources get a real extraction attempt (none fall to "Enrichment budget exceeded")
  const N = 10;
  const perCallTimeout = 100; // small fraction of budget
  const budgetMs = 2000; // enough for multiple rounds
  const concurrency = 5;

  const sources = Array.from({ length: N }, (_, i) => ({
    title: `Source ${i}`,
    url: `https://example.com/${i}`,
    domain: "example.com",
    snippet: `Snippet for source ${i}`,
  }));

  // Use real extraction with fast timeout to ensure we can complete within budget
  const results = await withEnrichmentBudget(sources, {
    timeoutMs: perCallTimeout,
    concurrency,
    // No keys - will fall back to snippet
  }, budgetMs);

  // All sources should have been attempted
  assert.equal(results.length, N);

  // Check that no sources were marked as "Enrichment budget exceeded" as the error
  // (they might still be snippet fallback due to no API keys, but that's different)
  const budgetExceededCount = results.filter(
    (r) => r.enrichmentError === "Enrichment budget exceeded"
  ).length;

  assert.ok(
    budgetExceededCount === 0,
    `Expected 0 sources with budget exceeded, got ${budgetExceededCount}. Results: ${results.map((r) => r.enrichmentError).join(", ")}`,
  );
});
