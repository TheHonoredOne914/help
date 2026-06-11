import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";

test("generic Indian parliamentary prompt does not produce junk duplicated-year queries", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Analyze the 2026 India parliamentary issue in Indian Mock Parliament style with Treasury Bench and Opposition arguments.",
    outputDepth: "detailed",
  });
  const plan = buildBucketedQueryPlan(contract, "deep_research");
  const queries = plan.queries.map((item) => item.query);
  const joined = queries.join("\n");

  assert.doesNotMatch(joined, /\b(20\d{2})\s+\1\b/);
  assert.doesNotMatch(joined, /India parliamentary issue The Hindu Indian Express/i);
  assert.doesNotMatch(joined, /^India parliament official source(?:\s+20\d{2})?$/im);
  assert.doesNotMatch(joined, /^India Supreme Court judgment(?:\s+20\d{2})?$/im);
  assert.ok(queries.some((query) => /site:sansad\.in/i.test(query)));
  assert.ok(queries.some((query) => /site:thehindu\.com/i.test(query)));
  assert.ok(queries.some((query) => /site:sci\.gov\.in/i.test(query)));
});

test("topic words from a specific prompt appear in generated queries", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Analyze UAPA, FCRA, EVM VVPAT and electoral bonds for Indian Parliament from 2022-2025.",
    outputDepth: "deep_research",
  });
  const queries = buildBucketedQueryPlan(contract, "deep_research").queries.map((item) => item.query);

  assert.ok(queries.some((query) => /\bUAPA\b/i.test(query)));
  assert.ok(queries.some((query) => /\bFCRA\b/i.test(query)));
  assert.ok(queries.some((query) => /\bEVM\b|\bVVPAT\b/i.test(query)));
  assert.doesNotMatch(queries.join("\n"), /\b(20\d{2})\s+\1\b/);
});
