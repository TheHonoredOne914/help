import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { runBucketedRetrieval } from "../../src/core/retrieval/bucketed-retrieval.js";
import type { BucketedQueryPlan } from "../../src/core/retrieval/query-planning/types.js";

function smallPlan() {
  const contract = buildAgendaContract({ requestId: "bucket-test", originalUserQuery: "India democratic space 2022 2025 Freedom House Supreme Court ECI press freedom" });
  const base = buildBucketedQueryPlan(contract);
  return { ...base, queries: base.queries.slice(0, 6), buckets: base.buckets.slice(0, 6) };
}

test("mock retrieval builds raw, deduped, filtered, scored, and enriched stages", async () => {
  const result = await runBucketedRetrieval(smallPlan(), { live: false, maxResultsPerQuery: 2 });

  assert.ok(result.rawResults.length > 0);
  assert.ok(result.dedupedResults.length <= result.rawResults.length);
  assert.ok(result.filteredResults.length <= result.dedupedResults.length);
  assert.ok(result.enrichedResults.every((source) => typeof source.score === "number"));
  assert.ok(result.citationEligibleEstimate >= 0);
});

test("weak live buckets trigger top-up attempts and SourceGapReport without crashing", async () => {
  const result = await runBucketedRetrieval(smallPlan(), {
    mode: "deep_research",
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-test-key" },
    maxResultsPerQuery: 1,
    fetchFn: async () => new Response(JSON.stringify({
      results: [{ title: "India press freedom", url: "https://rsf.org/en/country/india", content: "India press freedom watchdog 2024" }],
    }), { status: 200 }),
    enrichFetchFn: async () => new Response("<html><article>India press freedom watchdog 2024 full text with court and rights context.</article></html>", { status: 200 }),
  });

  assert.ok(result.topUpAttempts.length > 0);
  assert.ok(result.sourceGapReport);
  assert.ok(result.sourceGapReport.failedBuckets.length + result.sourceGapReport.weakBuckets.length >= 0);
});

test("enrichment failures are reported but do not crash retrieval", async () => {
  const result = await runBucketedRetrieval(smallPlan(), {
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      results: [{ title: "Supreme Court India", url: "https://main.sci.gov.in/judgment.pdf", content: "India Supreme Court" }],
    }), { status: 200 }),
    enrichFetchFn: async () => { throw new Error("network failed with sk-or-v1-secret"); },
  });

  assert.ok(result.enrichedResults.length > 0);
  assert.match(result.sourceGapReport?.enrichmentFailures.join("\n") ?? result.providerErrors.join("\n"), /REDACTED|network failed/);
});

test("post-enrichment source attrition triggers targeted repair top-up", async () => {
  const contract = buildAgendaContract({ requestId: "post-enrichment-repair", originalUserQuery: "India democratic space Supreme Court Election Commission press freedom" });
  const base = buildBucketedQueryPlan(contract);
  const governmentBucket = base.buckets.find((bucket) => bucket.id === "government_official") ?? base.buckets[0]!;
  const plan: BucketedQueryPlan = {
    ...base,
    buckets: [governmentBucket],
    queries: Array.from({ length: 4 }, (_, index) => ({
      id: `initial_${index + 1}`,
      bucketId: governmentBucket.id,
      query: `India democratic space government official report ${index + 1}`,
      priority: "broad_discovery",
      expectedDomains: governmentBucket.preferredDomains,
      maxResultsPerQuery: 1,
      timeoutMs: 1000,
    })),
    topUpPolicy: { minCitationEligibleSources: 1, minFinalUniqueCitedSources: 4, weakBucketTopUp: true },
  };
  let searchCalls = 0;
  const events: string[] = [];
  const longRepairText = Array.from({ length: 90 }, (_, index) => [
    `India democratic space evidence paragraph ${index}.`,
    "The government official record discusses Election Commission safeguards, Supreme Court constitutional review, press freedom concerns, and parliamentary accountability.",
    "It provides policy facts, legal context, administrative dates, rights implications, and official institutional reasoning for an Indian parliamentary debate.",
  ].join(" ")).join(" ");

  const result = await runBucketedRetrieval(plan, {
    mode: "fast_research",
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-test-key" },
    maxResultsPerQuery: 1,
    minCitationEligibleSources: 1,
    minFinalUniqueCitedSources: 4,
    maxSourcesToEnrich: 8,
    extractionTimeoutMs: 1000,
    emit: (event) => events.push(event.type),
    fetchFn: async () => {
      searchCalls += 1;
      const phase = searchCalls <= plan.queries.length ? "initial" : "repair";
      const content = phase === "initial"
        ? "India democratic space short mention."
        : [
            "Official Election Commission safeguards and Supreme Court constitutional review evidence for India democratic space.",
            "Parliamentary accountability, press freedom, civil liberties, administrative circulars, legal doctrine, and public-order reasoning are discussed.",
            `Distinct repaired evidence source ${searchCalls} with independent policy facts and institutional context.`,
          ].join(" ");
      return new Response(JSON.stringify({
        results: [{
          title: `India democratic space Election Commission Supreme Court government official evidence ${phase} ${searchCalls}`,
          url: `https://pib.gov.in/${phase}-${searchCalls}`,
          content,
        }],
      }), { status: 200 });
    },
    enrichFetchFn: async (url) => {
      if (String(url).includes("/initial-")) {
        return new Response("<html><article>thin</article></html>", { status: 200 });
      }
      return new Response(`<html><article>${longRepairText}</article></html>`, { status: 200 });
    },
  });

  assert.ok(events.includes("source_enrichment_repair_started"));
  assert.ok(events.includes("source_enrichment_repair_completed"));
  assert.ok(result.topUpAttempts.length > 0);
  assert.ok(searchCalls > plan.queries.length);
  assert.ok(result.enrichedResults.length > plan.queries.length);
  assert.equal(result.sourceGapReport?.repairAttempted, true);
});

test("duplicate URLs across live search providers merge discoveredBy provenance", async () => {
  const result = await runBucketedRetrieval(smallPlan(), {
    live: true,
    providers: ["serper", "exa"],
    providerKeys: { serper: "serper-test-key", exa: "exa-test-key" },
    maxResultsPerQuery: 1,
    fetchFn: async (url) => {
      if (String(url).includes("serper")) {
        return new Response(JSON.stringify({
          organic: [{ title: "Same PRS source", link: "https://prsindia.org/source?utm_source=x", snippet: "PRS keyword source" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        results: [{ title: "Same PRS source semantic", url: "https://prsindia.org/source", text: "PRS semantic source", score: 0.8 }],
      }), { status: 200 });
    },
    enrichFetchFn: async () => new Response("<html><article>PRS full source text for Indian parliamentary research.</article></html>", { status: 200 }),
  });

  const merged = result.dedupedResults.find((source) => source.url === "https://prsindia.org/source");
  assert.ok(merged);
  assert.deepEqual(merged.discoveredBy, ["serper", "exa"]);
});
