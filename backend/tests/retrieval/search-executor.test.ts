import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { RetrievalError, runSearchPlan } from "../../src/core/retrieval/search-executor.js";
import type { RawSearchResult } from "../../src/core/retrieval/search-executor.js";
import { CacheManager } from "../../src/services/cache-manager.js";

function plan() {
  const contract = buildAgendaContract({ requestId: "search-test", originalUserQuery: "India democratic space press freedom 2022 2025" });
  const base = buildBucketedQueryPlan(contract);
  return { ...base, queries: base.queries.slice(0, 4) };
}

function singleQueryPlan() {
  const base = plan();
  return {
    ...base,
    queries: base.queries.slice(0, 1),
    retryPolicy: { retries: 2, backoffMs: 1 },
  };
}

test("mock mode returns deterministic results with query and bucket provenance", async () => {
  const results = await runSearchPlan(plan(), { live: false, maxResultsPerQuery: 2 });

  assert.ok(results.length > 0);
  assert.equal(results[0].provider, "deterministic-plan");
  assert.equal(results[0].foundByQuery, plan().queries[0].query);
  assert.equal(results[0].bucketId, plan().queries[0].bucketId);
});

test("live mode without API keys returns no fake sources and records safe provider errors", async () => {
  const errors: string[] = [];
  await assert.rejects(
    () => runSearchPlan(plan(), {
      live: true,
      providers: ["tavily"],
      providerKeys: {},
      onProviderError: (error) => errors.push(error),
    }),
    (error) => {
      assert.ok(error instanceof RetrievalError);
      assert.equal(error.partialResults, 0);
      assert.match(error.providerFailures.join("\n"), /missing tavily api key/i);
      assert.doesNotMatch(error.providerFailures.join("\n"), /tvly-[A-Za-z0-9_-]{6,}/);
      return true;
    },
  );

  assert.match(errors.join("\n"), /missing tavily api key/i);
  assert.doesNotMatch(errors.join("\n"), /tvly-[A-Za-z0-9_-]{6,}/);
});

test("live mode calls provider fetch, preserves bucketId and foundByQuery, and allows raw duplicates", async () => {
  let maxActive = 0;
  let active = 0;
  const results = await runSearchPlan(plan(), {
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-test-key" },
    maxConcurrency: 1,
    maxResultsPerQuery: 2,
    fetchFn: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(JSON.stringify({
        results: [
          { title: "Freedom House India", url: "https://freedomhouse.org/country/india", content: "India democracy score" },
          { title: "Freedom House India duplicate", url: "https://freedomhouse.org/country/india", content: "duplicate" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(maxActive, 1);
  assert.ok(results.length >= 2);
  assert.equal(results[0].provider, "tavily");
  assert.equal(results[0].bucketId, plan().queries[0].bucketId);
  assert.equal(results[0].foundByQuery, plan().queries[0].query);
  assert.ok(results.filter((result) => result.url === "https://freedomhouse.org/country/india").length > 1);
});

test("live mode resolves provider keys from server environment when no headers are supplied", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-env-search";
  try {
    let observedBody = "";
    const results = await runSearchPlan(singleQueryPlan(), {
      live: true,
      providers: ["tavily"],
      maxResultsPerQuery: 1,
      fetchFn: async (_url, init) => {
        observedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          results: [
            { title: "PRS source", url: "https://prsindia.org/example", content: "Parliamentary policy evidence" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    assert.match(observedBody, /tvly-env-search/);
    assert.equal(results[0].provider, "tavily");
  } finally {
    if (previous === undefined) {
      delete process.env.TAVILY_API_KEY;
    } else {
      process.env.TAVILY_API_KEY = previous;
    }
  }
});

test("live mode rewrites site-targeted queries cleanly for semantic providers", async () => {
  let observedQuery = "";
  const base = singleQueryPlan();
  const customPlan = {
    ...base,
    queries: [{
      ...base.queries[0],
      query: "site:mha.gov.in annual report 2024 2025 UAPA FCRA India",
      expectedDomains: ["mha.gov.in", "pib.gov.in"],
    }],
  };

  await runSearchPlan(customPlan, {
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-clean-query-test" },
    maxResultsPerQuery: 1,
    fetchFn: async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      observedQuery = body.query ?? "";
      return new Response(JSON.stringify({
        results: [
          { title: "MHA annual report", url: "https://mha.gov.in/report", content: "official report" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.doesNotMatch(observedQuery, /\bdomains\b/i);
  assert.doesNotMatch(observedQuery, /pib\.gov\.inannual/i);
  assert.match(observedQuery, /^mha\.gov\.in pib\.gov\.in annual report/i);
});

test("live mode rewrites site-targeted queries cleanly for Serper free-tier compatibility", async () => {
  let observedQuery = "";
  const base = singleQueryPlan();
  const customPlan = {
    ...base,
    queries: [{
      ...base.queries[0],
      query: "(site:sansad.in OR site:prsindia.org) election deepfake transparency India",
      expectedDomains: ["sansad.in", "prsindia.org"],
    }],
  };

  const results = await runSearchPlan(customPlan, {
    live: true,
    providers: ["serper"],
    providerKeys: { serper: "serper-query-pattern-test" },
    maxResultsPerQuery: 1,
    fetchFn: async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { q?: string };
      observedQuery = body.q ?? "";
      return new Response(JSON.stringify({
        organic: [
          { title: "PRS election source", link: "https://prsindia.org/elections", snippet: "election transparency evidence" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.doesNotMatch(observedQuery, /\bsite:/i);
  assert.doesNotMatch(observedQuery, /\bOR\b/i);
  assert.match(observedQuery, /^sansad\.in prsindia\.org election deepfake transparency India/i);
  assert.equal(results[0].foundByQuery, customPlan.queries[0].query);
});

test("live mode retries transient provider failures before returning search results", async () => {
  let attempts = 0;
  const results = await runSearchPlan(singleQueryPlan(), {
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-retry-test" },
    maxResultsPerQuery: 1,
    fetchFn: async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response("temporary provider error", { status: 503 });
      }
      return new Response(JSON.stringify({
        results: [
          { title: "Retry source", url: "https://prsindia.org/retry", content: "Recovered after retry" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(attempts, 3);
  assert.equal(results[0].url, "https://prsindia.org/retry");
});

test("live mode can replay cached search results before requiring a provider key", async () => {
  const cache = new CacheManager({ now: () => 1000 });
  let fetchCalls = 0;
  const events: string[] = [];
  const options = {
    live: true,
    providers: ["tavily" as const],
    providerKeys: { tavily: "tvly-cache-prime" },
    cache,
    useCache: true,
    maxResultsPerQuery: 1,
    onCacheEvent: (event: string) => events.push(event),
    fetchFn: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({
        results: [
          { title: "Cached PRS source", url: "https://prsindia.org/cache", content: "Cached parliamentary source" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  };

  const first = await runSearchPlan(singleQueryPlan(), options);
  const second = await runSearchPlan(singleQueryPlan(), {
    ...options,
    providerKeys: {},
    fetchFn: async () => {
      throw new Error("fetch should not run for cached search replay");
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(first[0].url, "https://prsindia.org/cache");
  assert.equal(second[0].url, "https://prsindia.org/cache");
  assert.ok(events.includes("cache_hit"));
});

test("legacy cache hit is promoted into retrieval cache", async () => {
  const cache = new CacheManager({ now: () => 1000 });
  const base = singleQueryPlan();
  const customPlan = {
    ...base,
    queries: [{
      ...base.queries[0],
      query: "plain cache promotion query",
      expectedDomains: [],
      bucketId: "policy_research" as const,
      maxResultsPerQuery: 1,
    }],
  };
  const legacyKey = "tavily:plain cache promotion query:policy_research:1";
  const cachedResult: RawSearchResult = {
    id: "legacy-promoted",
    title: "Legacy promoted source",
    url: "https://prsindia.org/promoted-cache",
    domain: "prsindia.org",
    snippet: "Legacy cached source",
    publishedDate: null,
    provider: "tavily",
    foundByQuery: "plain cache promotion query",
    bucketId: "policy_research",
    rawRank: 1,
    fetchedAt: "2026-06-07T00:00:00.000Z",
  };
  cache.set("search", legacyKey, [cachedResult], { freshness: "fresh" });

  const firstEvents: string[] = [];
  const first = await runSearchPlan(customPlan, {
    live: true,
    providers: ["tavily"],
    providerKeys: {},
    cache,
    useCache: true,
    maxResultsPerQuery: 1,
    onCacheEvent: (event) => firstEvents.push(event),
    fetchFn: async () => {
      throw new Error("fetch should not run for legacy cache replay");
    },
  });

  const secondEvents: string[] = [];
  const second = await runSearchPlan(customPlan, {
    live: true,
    providers: ["tavily"],
    providerKeys: {},
    useCache: true,
    maxResultsPerQuery: 1,
    onCacheEvent: (event) => secondEvents.push(event),
    fetchFn: async () => {
      throw new Error("fetch should not run after retrieval cache promotion");
    },
  });

  assert.equal(first[0].url, cachedResult.url);
  assert.equal(second[0].url, cachedResult.url);
  assert.ok(firstEvents.includes("cache_hit"));
  assert.ok(secondEvents.includes("retrieval_cache_hit"));
});

test("runSearchPlan records provider failures without mutating caller options", async () => {
  const errors: string[] = [];
  const onProviderError = (error: string) => errors.push(error);
  const options = {
    live: true,
    providers: ["tavily" as const],
    providerKeys: {},
    onProviderError,
  };

  await assert.rejects(() => runSearchPlan(singleQueryPlan(), options), RetrievalError);

  assert.equal(options.onProviderError, onProviderError);
  assert.ok(errors.some((error) => /missing tavily api key/i.test(error)));
});

test("live mode keeps result slots stable while limiting concurrent provider work", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const results = await runSearchPlan(plan(), {
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-limited-test" },
    maxConcurrency: 2,
    maxResultsPerQuery: 1,
    fetchFn: async (_url, init) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const body = JSON.parse(String(init?.body ?? "{}")) as { q?: string };
      await new Promise((resolve) => setTimeout(resolve, body.q?.includes("2025") ? 5 : 1));
      inFlight -= 1;
      return new Response(JSON.stringify({
        results: [
          { title: body.q ?? "query", url: `https://prsindia.org/${encodeURIComponent(body.q ?? "query")}`, content: body.q ?? "" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.ok(maxInFlight <= 2);
  assert.equal(results[0].foundByQuery, plan().queries[0].query);
  assert.equal(results[1].foundByQuery, plan().queries[1].query);
});

test("live search test stays gated unless LIVE_SEARCH_TESTS=true", { skip: process.env.LIVE_SEARCH_TESTS === "true" ? undefined : "LIVE_SEARCH_TESTS=false" }, async () => {
  const results = await runSearchPlan(plan(), { live: true });
  assert.ok(Array.isArray(results));
});
