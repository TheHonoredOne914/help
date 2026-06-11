import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../../src/core/retrieval/query-planner.js";

test("generic Indian parliamentary topics receive broad source bucket coverage", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Analyze the 2026 India parliamentary issue in Indian Mock Parliament style with Treasury Bench and Opposition arguments.",
    outputDepth: "detailed",
  });
  const plan = buildBucketedQueryPlan(contract, "deep_research");
  const ids = new Set(plan.buckets.map((bucket) => bucket.id));

  for (const expected of ["government_official", "parliamentary_records", "court_legal", "academic_research", "policy_research", "indian_major_media", "legal_commentary"]) {
    assert.ok(ids.has(expected as any), `missing ${expected}`);
  }
  assert.ok(ids.size >= 8);
});
