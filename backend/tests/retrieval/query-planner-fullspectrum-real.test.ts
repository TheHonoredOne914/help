import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";

const prompt = "Analyze India's declining democratic space from 2022-2025 using Freedom House, V-Dem, EIU, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, EVM/VVPAT allegations, electoral bonds, RSF, EPW, MHA, ECI, The Hindu, and Indian Express.";

test("council democratic-space planner has 14 buckets, 80+ unique queries, and low duplication", () => {
  const contract = buildAgendaContract({ requestId: "planner-full", originalUserQuery: prompt, outputDepth: "deep_research" });
  const plan = buildBucketedQueryPlan(contract, "council");
  const uniqueQueries = new Set(plan.queries.map((query) => query.query.toLowerCase()));
  const duplicateRate = plan.queries.length === 0 ? 0 : (plan.queries.length - uniqueQueries.size) / plan.queries.length;
  assert.equal(plan.buckets.length, 14);
  assert.ok(uniqueQueries.size >= 80, `expected 80+ unique queries, got ${uniqueQueries.size}`);
  assert.ok(duplicateRate < 0.1, `duplicate rate ${duplicateRate}`);
  assert.doesNotMatch([...uniqueQueries].join("\n"), /hi india ncrb statistics data cag\.gov\.in|freedom house.*freedom house.*freedom house/i);
});

test("phd democratic-space planner has 60+ unique queries", () => {
  const contract = buildAgendaContract({ requestId: "planner-phd", originalUserQuery: prompt, outputDepth: "deep_research" });
  const plan = buildBucketedQueryPlan(contract, "deep_research");
  const uniqueQueries = new Set(plan.queries.map((query) => query.query.toLowerCase()));
  assert.ok(uniqueQueries.size >= 60, `expected 60+ unique queries, got ${uniqueQueries.size}`);
});
