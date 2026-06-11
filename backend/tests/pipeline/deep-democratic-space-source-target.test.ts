import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { applyResearchModeSourceTargets, getPerRoleSourceUsageTarget, resolveSourceUsageExecutionMode } from "../../src/core/pipeline/research-pipeline.js";
import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";

test("deep democratic-space keeps restored deep source target instead of hidden PhD target", () => {
  const contract = buildAgendaContract({
    requestId: "deep-democracy",
    originalUserQuery: "Deep research on India democratic space, Freedom House, V-Dem, press freedom, elections, and civil liberties",
    outputDepth: "detailed",
  });
  contract.topicType = "indian_democratic_space";

  applyResearchModeSourceTargets(contract, "deep_research");

  assert.equal(contract.minimumUniqueCitedSources, 80);
  assert.equal(contract.minimumEvidenceCardsPerModel, 80);
});

test("per-role source usage targets are mode aware", () => {
  assert.equal(getPerRoleSourceUsageTarget("fast_research", getSourceUsagePolicy("fast_research"), 30), 30);
  assert.equal(getPerRoleSourceUsageTarget("deep_research", getSourceUsagePolicy("deep_research"), 30), 30);
  assert.equal(getPerRoleSourceUsageTarget("deep_research", getSourceUsagePolicy("deep_research"), 30), 20);
  assert.equal(getPerRoleSourceUsageTarget("council", getSourceUsagePolicy("council"), 30), 25);
});

test("fast and deep source requirements are minimums, not retrieval caps", () => {
  const fastContract = buildAgendaContract({
    requestId: "fast-minimum",
    originalUserQuery: "Fast research on GST Council and Indian federalism",
    outputDepth: "brief",
  });
  const deepContract = buildAgendaContract({
    requestId: "deep-minimum",
    originalUserQuery: "Deep research on GST Council and Indian federalism",
    outputDepth: "detailed",
  });

  applyResearchModeSourceTargets(fastContract, "fast_research");
  applyResearchModeSourceTargets(deepContract, "deep_research");

  assert.equal(fastContract.minimumUniqueCitedSources, 40);
  assert.equal(deepContract.minimumUniqueCitedSources, 80);
  assert.equal(getSourceUsagePolicy("fast_research").minimumToProceed, 40);
  assert.equal(getSourceUsagePolicy("deep_research").minimumToProceed, 80);
  assert.equal(getSourceUsagePolicy("council").minimumToProceed, 30);
});

test("mode source targets preserve stricter agenda contract floors", () => {
  const contract = buildAgendaContract({
    requestId: "strict-contract-floor",
    originalUserQuery: "Deep research with stricter explicit source floor",
    outputDepth: "detailed",
  });
  contract.minimumUniqueCitedSources = 120;
  contract.minimumEvidenceCardsPerModel = 100;

  applyResearchModeSourceTargets(contract, "deep_research");

  assert.equal(contract.minimumUniqueCitedSources, 120);
  assert.equal(contract.minimumEvidenceCardsPerModel, 120);
});

test("fast research honors explicit model source-usage mode when a provider is healthy", () => {
  const resolution = resolveSourceUsageExecutionMode({
    requestedMode: "model",
    liveRetrieval: true,
    providerRouter: { hasProvider: () => true } as any,
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    allowSyntheticSourceUsage: false,
    researchMode: "fast_research",
  });

  assert.equal(resolution.mode, "model");
});
