import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

const providerRouter = {
  hasProvider: () => true,
  complete: async () => ({ provider: "gemini", model: "test", content: JSON.stringify({ sourceUsageMap: [] }) }),
} as unknown as ProviderRouter;

function sources(count: number, withText = true) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Source ${index + 1}`,
    url: `https://example.org/route-${index + 1}`,
    canonicalUrl: `https://example.org/route-${index + 1}`,
    domain: "example.org",
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    authorityScore: 80,
    snippet: withText ? `Specific route recovery claim ${index + 1}.` : null,
    fullText: withText ? `Specific route recovery claim ${index + 1}.` : null,
    extractionQuality: withText ? "full" : "failed",
    keyFacts: withText ? [`Specific route recovery claim ${index + 1}`] : [],
    keyNumbers: [],
    legalHoldings: [],
    limitations: withText ? [`Limitation ${index + 1}`] : ["No extractable text was available."],
    citationEligible: true,
  }));
}

test("web_search-equivalent fast policy fails closed below the 40-source floor", async () => {
  const events: string[] = [];
  const previous = process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  process.env.SOURCE_USAGE_ROLES_USE_MODEL = "true";
  try {
    const result = await runResearchPipeline({
      userQuery: "quick web search India parliament",
      mode: "fast_research",
      preloadedSources: sources(5),
      liveRetrieval: false,
      useCoreGeneration: false,
      legacyFallback: async ({ sourceGapReport }) => `Web search answer completed with source gaps. ${sourceGapReport?.explanation ?? ""} [Source 1](https://example.org/route-1)`,
      generationMode: "model",
      providerRouter,
      providerName: "gemini",
      model: "test",
      allowSyntheticSourceUsage: false,
      emit: (event) => events.push(event.type),
    });
    assert.ok(result.sourceGapReport);
    assert.equal(result.terminalStatus, "failed");
    assert.equal(result.usedLegacyFallback, false);
    assert.notEqual(result.terminalStatus, "completed_with_source_gaps");
    assert.match(result.finalAnswer, /Insufficient Sources/i);
    assert.ok(events.includes("failed") || events.includes("pipeline_failed"));
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});

test("strict deep route fails closed when citation-eligible floor is missed", async () => {
  const previous = process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  process.env.SOURCE_USAGE_ROLES_USE_MODEL = "true";
  try {
    const result = await runResearchPipeline({
      userQuery: "Deep level India parliament",
      mode: "deep_research",
      preloadedSources: sources(5, false),
      liveRetrieval: false,
      useCoreGeneration: false,
      legacyFallback: async () => "should not be persisted as success",
      generationMode: "model",
      providerRouter,
      providerName: "gemini",
      model: "test",
      allowSyntheticSourceUsage: false,
    });
    assert.equal(result.terminalStatus, "failed");
    assert.equal(result.usedLegacyFallback, false);
    assert.match(result.finalAnswer, /Insufficient Sources/i);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});
