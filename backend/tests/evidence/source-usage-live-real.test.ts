import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

test("live mode disables synthetic SourceUsageMap when model role provider is absent", async () => {
  const events: string[] = [];
  const result = await runResearchPipeline({
    requestId: "source-usage-live",
    userQuery: "India democratic space 2022-2025",
    mode: "deep_research",
    liveRetrieval: true,
    allowMockRetrieval: false,
    allowSyntheticSourceUsage: false,
    useCoreGeneration: false,
    legacyFallback: async () => "Explicit test fallback with SourceGapReport.",
    searchOptions: { providers: ["tavily"], providerKeys: {} },
    emit: (event) => events.push(event.type),
  });

  assert.equal(result.modelRoleOutputs[0]?.sourceUsageRequirementSatisfied, false);
  assert.match(result.modelRoleOutputs[0]?.failureReason ?? "", /synthetic SourceUsageMap is disabled/i);
  assert.ok(events.includes("model_role_completed"));
});
