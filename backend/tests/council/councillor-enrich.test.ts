import test from "node:test";
import assert from "node:assert/strict";
import { enrichForCouncillor } from "../../src/core/council/councillor-enrich.js";

test("councillor enrichment reuses preloaded full text instead of extracting again", async () => {
  const enriched = await enrichForCouncillor({
    brief: {
      councillor_id: "C1_LEGAL",
      title: "Legal Councillor",
      retrieval_focus: ["court_legal"],
      query_lens: "constitutional accountability",
    } as any,
    councillorId: "C1_LEGAL",
    rawSources: [{
      title: "Preloaded judgment",
      url: "https://example.com/judgment",
      canonicalUrl: "https://example.com/judgment",
      domain: "example.com",
      bucketIds: ["court_legal"] as any,
      fullText: "A preloaded judgment text with enough detail for council reuse.",
      citationEligible: true,
    }],
    signal: new AbortController().signal,
    options: {
      fetchFn: async () => {
        throw new Error("fetch should not run for preloaded sources");
      },
      useCache: false,
      concurrency: 16,
    },
  });

  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].extractionMethod, "preloaded");
  assert.equal(enriched[0].fullText, "A preloaded judgment text with enough detail for council reuse.");
});
