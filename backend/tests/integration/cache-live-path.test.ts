import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { runBucketedRetrieval } from "../../src/core/retrieval/bucketed-retrieval.js";
import { CacheManager } from "../../src/services/cache-manager.js";

test("second same query reuses cached search and enrichment while emitting hit events", async () => {
  const contract = buildAgendaContract({ requestId: "cache", originalUserQuery: "India press freedom 2025" });
  const base = buildBucketedQueryPlan(contract);
  const plan = { ...base, queries: base.queries.slice(0, 1), buckets: base.buckets.slice(0, 1) };
  const cache = new CacheManager({ now: () => 1000 });
  let fetchCalls = 0;
  const events: string[] = [];

  const options = {
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-test-key" },
    cache,
    useCache: true,
    fetchFn: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ results: [{ title: "India RSF", url: "https://rsf.org/en/country/india", content: "India press freedom" }] }), { status: 200 });
    },
    enrichFetchFn: async () => new Response("<article>India press freedom source full text.</article>", { status: 200 }),
    emit: (event: any) => events.push(event.type ?? event),
  };

  await runBucketedRetrieval(plan, options as any);
  const fetchCallsAfterFirstRun = fetchCalls;
  await runBucketedRetrieval(plan, options as any);

  assert.ok(fetchCallsAfterFirstRun > 0);
  assert.equal(fetchCalls, fetchCallsAfterFirstRun);
  assert.ok(events.includes("cache_hit"));
});

test("cache redacts secret-like strings before storage", () => {
  const cache = new CacheManager({ now: () => 1000 });
  cache.set("search", "secret", { error: "Authorization: Bearer sk-or-v1-secret-value" }, { ttlMs: 1000 });
  assert.doesNotMatch(JSON.stringify(cache.get("search", "secret")), /sk-or-v1-secret-value/);
});
