import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { RetrievalError, runSearchPlan } from "../../src/core/retrieval/search-executor.js";

test("live search with mock disabled reports missing provider keys instead of deterministic sources", async () => {
  const contract = buildAgendaContract({ requestId: "search-missing-keys", originalUserQuery: "India democratic space 2025" });
  const plan = { ...buildBucketedQueryPlan(contract, "fast_research"), queries: buildBucketedQueryPlan(contract, "fast_research").queries.slice(0, 1) };
  const errors: string[] = [];
  await assert.rejects(
    () => runSearchPlan(plan, {
      live: true,
      allowMock: false,
      providers: ["tavily"],
      providerKeys: {},
      onProviderError: (error) => errors.push(error),
    }),
    (error) => {
      assert.ok(error instanceof RetrievalError);
      assert.equal(error.partialResults, 0);
      assert.match(error.providerFailures.join("\n"), /missing tavily api key/i);
      return true;
    },
  );

  assert.match(errors.join("\n"), /missing tavily api key/i);
});
