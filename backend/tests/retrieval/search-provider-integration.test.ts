import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { runSearchPlan } from "../../src/core/retrieval/search-executor.js";

test("core retrieval search uses Serper and Exa before Tavily and records provider provenance", async () => {
  const contract = buildAgendaContract({ requestId: "provider-integration", originalUserQuery: "India Supreme Court federalism parliamentary accountability" });
  const base = buildBucketedQueryPlan(contract, "fast_research");
  const plan = { ...base, queries: base.queries.slice(0, 1) };
  const requestedUrls: string[] = [];

  const results = await runSearchPlan(plan, {
    live: true,
    providerKeys: { serper: "serper-test", exa: "exa-test", tavily: "tvly-test" },
    maxResultsPerQuery: 1,
    fetchFn: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("serper")) {
        return new Response(JSON.stringify({ organic: [{ title: "Serper source", link: "https://prsindia.org/source", snippet: "PRS source" }] }), { status: 200 });
      }
      if (String(url).includes("exa")) {
        return new Response(JSON.stringify({ results: [{ title: "Exa source", url: "https://prsindia.org/source", text: "Semantic PRS source", score: 0.7 }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [{ title: "Tavily source", url: "https://pib.gov.in/source", content: "Fallback source" }] }), { status: 200 });
    },
  });

  assert.match(requestedUrls[0], /serper/);
  assert.match(requestedUrls[1], /exa/);
  assert.match(requestedUrls[2], /tavily/);
  assert.ok(results.some((result) => result.provider === "serper"));
  assert.ok(results.some((result) => result.provider === "exa"));
  assert.ok(results.every((result) => Array.isArray(result.discoveredBy)));
});

test("core retrieval search returns no fake sources when no live providers are configured", async () => {
  const contract = buildAgendaContract({ requestId: "no-provider-integration", originalUserQuery: "India Parliament source test" });
  const base = buildBucketedQueryPlan(contract, "fast_research");
  const plan = { ...base, queries: base.queries.slice(0, 1) };
  const errors: string[] = [];

  const results = await runSearchPlan(plan, {
    live: true,
    providerKeys: {},
    onProviderError: (error) => errors.push(error),
    fetchFn: async () => {
      throw new Error("fetch should not run without configured providers");
    },
  });

  assert.deepEqual(results, []);
  assert.match(errors.join("\n"), /No live search providers configured/);
  assert.match(errors.join("\n"), /Serper/);
  assert.match(errors.join("\n"), /Exa/);
  assert.match(errors.join("\n"), /Tavily/);
});
