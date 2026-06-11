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

test("web_search-equivalent fast policy completes with source gaps instead of requiring 30-source proof", async () => {
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
    assert.ok(events.includes("source_gap_report_created"));
    assert.match(result.finalAnswer, /source gaps/i);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});

test("strict phd route fails honestly when source usage cannot be proven", async () => {
  const previous = process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  process.env.SOURCE_USAGE_ROLES_USE_MODEL = "true";
  try {
    await assert.rejects(() => runResearchPipeline({
      userQuery: "PhD level India parliament",
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
    }), (error: any) => error?.code === "SOURCE_USAGE_VALIDATION_FAILED");
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});
