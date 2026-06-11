import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../../src/core/retrieval/query-planner.js";

test("query plan telemetry records generated and rejected query decisions", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "India democratic space",
    outputDepth: "detailed",
  });
  const plan = buildBucketedQueryPlan({
    ...contract,
    forbiddenDriftTerms: [...contract.forbiddenDriftTerms, "Freedom House"],
  }, "deep_research");

  assert.ok(plan.queryTelemetry && plan.queryTelemetry.length > 0);
  assert.ok(plan.queryTelemetry.some((entry) => entry.queryText && entry.bucketId && entry.mode && entry.source));
  assert.ok(plan.queryTelemetry.some((entry) => entry.status === "rejected" && entry.driftStatus === "rejected"));
});
