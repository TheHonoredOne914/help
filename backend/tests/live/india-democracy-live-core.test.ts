import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

const hasKeys = Boolean(
  process.env.LIVE_SEARCH_TESTS === "true"
  && (process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY || process.env.SERPER_API_KEY)
  && (process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY)
);

test("India democracy live core path is gated and meaningful", { skip: hasKeys ? undefined : "Set LIVE_SEARCH_TESTS=true plus search/model keys to run live core evaluation" }, async () => {
  const events: string[] = [];
  const result = await runResearchPipeline({
    requestId: "live-india-democracy",
    userQuery: "Analyze India’s declining democratic space from 2022–2025 using Freedom House, V-Dem, EIU, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, EVM/VVPAT allegations, electoral bonds, RSF, EPW, MHA, ECI, The Hindu, and Indian Express. Make it Indian Mock Parliament-ready with research angles, Treasury Bench arguments, Opposition arguments, POIs, rebuttals, and resolution clauses.",
    mode: "deep_research",
    liveRetrieval: true,
    allowMockRetrieval: false,
    emit: (event) => events.push(event.type),
  });

  assert.equal(result.usedCoreGeneration, true);
  assert.equal(result.usedLegacyFallback, false);
  assert.ok(events.includes("bucket_search_started"));
  assert.ok(result.sourceGapReport || result.citationReport.uniqueCitedSourceCount >= 30);
  assert.match(result.finalAnswer, /Treasury Bench|Opposition|POI|rebuttal/i);
  assert.doesNotMatch(result.finalAnswer, /member states|UN resolution|Security Council/i);
});
