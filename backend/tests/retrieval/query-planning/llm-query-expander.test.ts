import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlanWithExpansion } from "../../../src/core/retrieval/query-planner.js";

test("LLM query expansion accepts validated schema and marks query source", async () => {
  const contract = buildAgendaContract({ originalUserQuery: "ONDC digital commerce policy India", outputDepth: "deep_research" });
  const providerRouter = {
    completeJson: async () => ({
      provider: "nvidia",
      model: "moonshotai/kimi-k2.6",
      content: "{}",
      json: {
        queries: [
          {
            query: "ONDC India digital commerce parliamentary committee report",
            bucketId: "parliamentary_records",
            expectedDomains: ["sansad.in", "prsindia.org"],
            roleLens: "policy_pathways",
            freshnessTags: ["current"],
          },
        ],
      },
    }),
  } as any;

  const plan = await buildBucketedQueryPlanWithExpansion(contract, "deep_research", {
    providerRouter,
    providerName: "nvidia",
    model: "moonshotai/kimi-k2.6",
  });

  assert.ok(plan.queries.some((query) => query.source === "llm" && /ONDC India digital commerce/i.test(query.query)));
});

test("LLM query expansion falls back deterministically on invalid schema", async () => {
  const contract = buildAgendaContract({ originalUserQuery: "ONDC digital commerce policy India", outputDepth: "deep_research" });
  const providerRouter = {
    completeJson: async () => ({
      provider: "nvidia",
      model: "moonshotai/kimi-k2.6",
      content: "{}",
      json: { bad: true },
    }),
  } as any;

  const plan = await buildBucketedQueryPlanWithExpansion(contract, "deep_research", {
    providerRouter,
    providerName: "nvidia",
    model: "moonshotai/kimi-k2.6",
  });

  assert.ok(plan.queries.some((query) => query.source === "fallback"));
  assert.ok(plan.queryTelemetry?.some((entry) => entry.source === "llm" && entry.status === "rejected"));
});
