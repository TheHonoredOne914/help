import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../../src/core/retrieval/query-planner.js";

test("fast and phd modes produce different query text, counts, and strategy sources", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "ONDC digital commerce regulation in Indian Parliament",
    outputDepth: "deep_research",
  });
  const fast = buildBucketedQueryPlan(contract, "fast_research");
  const phd = buildBucketedQueryPlan(contract, "deep_research");

  assert.ok(fast.queries.length < phd.queries.length);
  assert.notDeepEqual(fast.queries.map((query) => query.query), phd.queries.map((query) => query.query).slice(0, fast.queries.length));
  assert.ok(fast.queries.some((query) => query.source === "fallback" || query.source === "top_up"));
  assert.ok(phd.queries.some((query) => query.source === "fallback" || query.source === "top_up" || query.source === "parliamentary"));
});

test("research modes add qualitatively different query text families", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "ONDC digital commerce regulation in Indian Parliament",
    outputDepth: "deep_research",
  });
  const fastText = allQueryText(buildBucketedQueryPlan(contract, "fast_research"));
  const deepText = allQueryText(buildBucketedQueryPlan(contract, "deep_research"));
  const phdText = allQueryText(buildBucketedQueryPlan(contract, "deep_research"));
  const fullText = allQueryText(buildBucketedQueryPlan(contract, "council"));

  assert.match(fastText, /policy overview/i);
  assert.match(deepText, /recent developments|key arguments/i);
  assert.match(phdText, /scholarly analysis|statistical data evidence|trend analysis/i);
  assert.match(fullText, /Treasury Bench Opposition counterarguments|comparative policy analysis|implementation gaps/i);
  assert.doesNotMatch(fastText, /scholarly analysis|Treasury Bench Opposition counterarguments/i);
});

test("council adds timeline, counterargument, and comparative strategies", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "DPDP Act, digital rights, and AI governance in India",
    outputDepth: "deep_research",
  });
  const plan = buildBucketedQueryPlan(contract, "council");
  const strategies = new Set(plan.queries.map((query) => query.strategy).filter(Boolean));

  assert.ok(strategies.has("timeline"));
  assert.ok(strategies.has("counterargument"));
  assert.ok(strategies.has("comparative"));
});

function allQueryText(plan: ReturnType<typeof buildBucketedQueryPlan>): string {
  return plan.queries.map((query) => query.query).join("\n");
}
