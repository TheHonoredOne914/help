import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan, PHD_RESEARCH_LIMITS } from "../../src/core/retrieval/query-planner.js";

test("bucketed query planner emits domain-specific democracy queries without AI or UN drift", () => {
  const contract = buildAgendaContract({ originalUserQuery: "Analyze India's democratic space from 2022-2025 Freedom House V-Dem EIU UAPA FCRA internet shutdowns Supreme Court ECI RSF HRW Amnesty CIVICUS EPW The Hindu Indian Express" });
  const plan = buildBucketedQueryPlan(contract);
  const joined = plan.queries.map((query) => query.query).join("\n");

  assert.ok(plan.queries.length >= 60);
  assert.ok(plan.queries.length <= PHD_RESEARCH_LIMITS.maxTotalQueries);
  for (const term of ["Freedom House", "V-Dem", "EIU", "site:mha.gov.in", "Supreme Court", "HRW", "Amnesty", "CIVICUS", "RSF", "Access Now", "site:epw.in", "site:thehindu.com", "site:indianexpress.com"]) {
    assert.match(joined, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(joined, /generative AI|UN Security Council|member states|UN resolution/i);
});
