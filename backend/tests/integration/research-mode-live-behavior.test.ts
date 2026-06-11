import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { modeRetrievalOptions } from "../../src/core/retrieval/bucketed-retrieval.js";
import { applyResearchModeSourceTargets } from "../../src/core/pipeline/research-pipeline.js";

test("research modes change query, enrichment, source, and repair limits", () => {
  const fast = modeRetrievalOptions("fast_research");
  const deep = modeRetrievalOptions("deep_research");
  const phd = modeRetrievalOptions("deep_research");
  const full = modeRetrievalOptions("council");

  assert.ok(fast.maxRawResults < deep.maxRawResults);
  assert.ok(deep.maxRawResults < phd.maxRawResults);
  assert.ok(full.maxSourcesToEnrich >= phd.maxSourcesToEnrich);
  assert.equal(phd.minFinalUniqueCitedSources, 30);
  assert.equal(full.minFinalUniqueCitedSources, 30);
});

test("explicit UI mode overrides text inference for source targets", () => {
  const contract = buildAgendaContract({ requestId: "mode", originalUserQuery: "quick India democracy but use full mode", outputDepth: "deep_research" });
  applyResearchModeSourceTargets(contract, "council");
  const plan = buildBucketedQueryPlan(contract, "council");

  assert.ok(contract.minimumUniqueCitedSources >= 30);
  assert.ok(plan.queries.length > 25);
});
