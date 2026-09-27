import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { RetrievalError, runSearchPlan } from "../../src/core/retrieval/search-executor.js";
import type { RawSearchResult } from "../../src/core/retrieval/search-executor.js";
import { CacheManager } from "../../src/services/cache-manager.js";
import { writeSearchResults } from "../../src/core/retrieval-cache/search-result-cache.js";

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

    assert.match(observedBody, /freedomhouse\.org v-dem\.net/);
    assert.ok(process.env.TAVILY_API_KEY === "tvly-env-search");
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

test("retrieval cache hit replays search results without provider fetch", async () => {
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
  const query = customPlan.queries[0]!;
  const cachedResult: RawSearchResult = {
    id: "retrieval-cached",
    title: "Retrieval cached source",
    url: "https://prsindia.org/promoted-cache",
    domain: "prsindia.org",
    snippet: "Retrieval cached source",
    publishedDate: null,
    provider: "tavily",
    foundByQuery: query.query,
    bucketId: "policy_research",
    rawRank: 1,
    fetchedAt: "2026-06-07T00:00:00.000Z",
  };
  writeSearchResults({
    provider: "tavily",
    query: query.query,
    mode: customPlan.agendaContract.outputDepth,
    topicType: customPlan.agendaContract.topicType,
    bucket: query.bucketId,
    maxResults: 1,
  }, [cachedResult]);

  const events: string[] = [];
  const results = await runSearchPlan(customPlan, {
    live: true,
    providers: ["tavily"],
    providerKeys: { tavily: "tvly-cache-test" },
    useCache: true,
    maxResultsPerQuery: 1,
    mode: customPlan.agendaContract.outputDepth,
    topicType: customPlan.agendaContract.topicType,
    onCacheEvent: (event) => events.push(event),
    fetchFn: async () => {
      throw new Error("fetch should not run for retrieval cache replay");
    },
  });

  assert.equal(results[0].url, cachedResult.url);
  assert.ok(events.includes("cache_hit"));
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

test("single-provider hedge merges one extra search provider for URL diversity", async () => {
  const called = new Set<string>();
  const base = singleQueryPlan();
  // Official bucket prefers serper → exa → tavily → brave.
  const customPlan = {
    ...base,
    queries: [{
      ...base.queries[0],
      bucketId: "government_official" as const,
      query: "Election Commission deepfake advertising transparency India",
      expectedDomains: ["eci.gov.in", "pib.gov.in"],
    }],
  };

  const results = await runSearchPlan(customPlan, {
    mode: "fast_research",
    live: true,
    providers: ["serper", "exa", "tavily"],
    providerKeys: { serper: "serper-div-test", exa: "exa-div-test", tavily: "tvly-div-test" },
    useCache: false,
    maxResultsPerQuery: 2,
    fetchFn: async (url) => {
      const href = String(url);
      if (href.includes("serper.dev")) {
        called.add("serper");
        return new Response(JSON.stringify({ organic: [] }), { status: 200 });
      }
      if (href.includes("api.exa.ai")) {
        called.add("exa");
        return new Response(JSON.stringify({
          results: [{ title: "Exa ECI note", url: "https://eci.gov.in/exa-note", text: "Exa deepfake advertising evidence", score: 0.9 }],
        }), { status: 200 });
      }
      if (href.includes("api.tavily.com")) {
        called.add("tavily");
        return new Response(JSON.stringify({
          results: [{ title: "Tavily ECI note", url: "https://eci.gov.in/tavily-note", content: "Tavily platform transparency evidence" }],
        }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    },
  });

  assert.ok(called.has("exa"), "exa should supply the hedge hit");
  assert.ok(called.has("tavily"), "tavily should be pulled in for single-provider diversify");
  const providers = new Set(results.map((row) => row.provider));
  assert.ok(providers.has("exa"));
  assert.ok(providers.has("tavily"));
  assert.ok(results.some((row) => row.url.includes("tavily-note")));
});

test("single-provider search cache hit still diversifies with one unused provider", async () => {
  const base = singleQueryPlan();
  const customPlan = {
    ...base,
    queries: [{
      ...base.queries[0],
      bucketId: "government_official" as const,
      query: "cached exa only deepfake advertising India diversify",
      expectedDomains: [] as string[],
      maxResultsPerQuery: 2,
    }],
  };
  const query = customPlan.queries[0]!;
  const cachedResult: RawSearchResult = {
    id: "exa-cached-only",
    title: "Cached Exa ECI note",
    url: "https://eci.gov.in/cached-exa-note",
    domain: "eci.gov.in",
    snippet: "Cached Exa deepfake advertising evidence",
    publishedDate: null,
    provider: "exa",
    foundByQuery: query.query,
    bucketId: "government_official",
    rawRank: 1,
    fetchedAt: "2026-06-07T00:00:00.000Z",
  };
  // Prime primary (serper for government_official) cache key with exa-only rows —
  // mirrors poisoned single-provider cache hits from earlier runs.
  writeSearchResults({
    provider: "serper",
    query: query.query,
    mode: "fast_research",
    topicType: customPlan.agendaContract.topicType,
    bucket: query.bucketId,
    maxResults: 2,
  }, [cachedResult]);

  const called = new Set<string>();
  const results = await runSearchPlan(customPlan, {
    mode: "fast_research",
    live: true,
    providers: ["serper", "exa", "tavily"],
    providerKeys: { serper: "serper-cache-div", exa: "exa-cache-div", tavily: "tvly-cache-div" },
    useCache: true,
    maxResultsPerQuery: 2,
    topicType: customPlan.agendaContract.topicType,
    fetchFn: async (url) => {
      const href = String(url);
      if (href.includes("serper.dev")) {
        called.add("serper");
        return new Response(JSON.stringify({ organic: [] }), { status: 200 });
      }
      if (href.includes("api.exa.ai")) {
        called.add("exa");
        return new Response(JSON.stringify({
          results: [{ title: "Live Exa", url: "https://eci.gov.in/live-exa", text: "should not be needed" }],
        }), { status: 200 });
      }
      if (href.includes("api.tavily.com")) {
        called.add("tavily");
        return new Response(JSON.stringify({
          results: [{ title: "Tavily from cache diversify", url: "https://eci.gov.in/tavily-from-cache", content: "Fresh tavily URL" }],
        }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    },
  });

  assert.equal(called.has("exa"), false, "exa live fetch should not run when cache already has exa rows");
  assert.ok(called.has("tavily") || called.has("serper"), "an unused provider should be fetched to diversify");
  assert.ok(results.some((row) => row.url.includes("cached-exa-note")));
  assert.ok(
    results.some((row) => row.url.includes("tavily-from-cache")) || results.some((row) => row.provider !== "exa"),
    "diversify should add a non-exa URL",
  );
});

test("live search test stays gated unless LIVE_SEARCH_TESTS=true", { skip: process.env.LIVE_SEARCH_TESTS === "true" ? undefined : "LIVE_SEARCH_TESTS=false" }, async () => {
  const results = await runSearchPlan(plan(), { live: true });
  assert.ok(Array.isArray(results));
});
