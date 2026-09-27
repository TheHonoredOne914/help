import test from "node:test";
import assert from "node:assert/strict";
import { resolveSourceUsageExecutionMode } from "../../src/core/pipeline/research-pipeline.js";
import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";
import { RESEARCH_LIMITS } from "../../src/core/config/research-mode.js";

test("deep and council default to deterministic source usage like fast", () => {
  for (const researchMode of ["fast_research", "deep_research", "council"] as const) {
    const resolution = resolveSourceUsageExecutionMode({
      requestedMode: "model",
      liveRetrieval: true,
      providerRouter: { hasProvider: () => true } as any,
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
      allowSyntheticSourceUsage: false,
      researchMode,
    });
    // Call sites clear generationMode:"model" unless SOURCE_USAGE_ROLES_USE_MODEL is set.
    // resolveSourceUsageExecutionMode itself still honors explicit requestedMode:"model".
    assert.equal(resolution.mode, "model");

    const defaulted = resolveSourceUsageExecutionMode({
      requestedMode: undefined,
      liveRetrieval: true,
      providerRouter: { hasProvider: () => true } as any,
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
      allowSyntheticSourceUsage: false,
      researchMode,
    });
    assert.equal(defaulted.mode, "deterministic", `${researchMode} should default deterministic`);
  }
});

test("council source-usage and research limits share the reachable 110 floor", () => {
  const policy = getSourceUsagePolicy("council");
  assert.equal(policy.requiredSources, RESEARCH_LIMITS.council.minFinalUniqueCitedSources);
  assert.equal(policy.minimumToProceed, 110);
  assert.equal(policy.allowDeterministicExtractionFallback, true);
  assert.equal(policy.allowCompletedWithSourceGaps, true);
  assert.equal(RESEARCH_LIMITS.council.minCitationEligibleSources, 110);
});
