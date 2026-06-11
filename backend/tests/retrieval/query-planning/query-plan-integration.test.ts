import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../../src/core/retrieval/query-planner.js";

test("integrated planner avoids accountability fallback, duplicate years, and generic shallow plans", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "ONDC digital commerce and small sellers in Indian Parliament 2026",
    outputDepth: "deep_research",
  });
  const plan = buildBucketedQueryPlan(contract, "council");
  const joined = plan.queries.map((query) => query.query).join("\n");

  assert.doesNotMatch(joined, /\baccountability\b/i);
  assert.doesNotMatch(joined, /\b(20\d{2})\s+\1\b/);
  assert.ok(plan.queries.some((query) => /site:sansad\.in|site:prsindia\.org/i.test(query.query)));
  assert.ok(new Set(plan.queries.map((query) => query.query.toLowerCase())).size >= 40);
});

test("food security stays topic-specific through planning", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "food security, MSP, PDS, and nutrition policy in India",
    outputDepth: "detailed",
  });
  const plan = buildBucketedQueryPlan(contract, "deep_research");
  const joined = plan.queries.map((query) => query.query).join("\n");

  assert.notEqual(contract.topicType, "indian_security_policy");
  assert.match(joined, /food|MSP|PDS|nutrition|agriculture/i);
  assert.doesNotMatch(joined, /\bterrorism\b|\bdefence\b|\bLAC\b/i);
});
