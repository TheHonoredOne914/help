import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { decideFinalResearchStatus } from "../../src/core/pipeline/final-status.js";

describe("final status degraded fallback", () => {
  const baseInput = {
    mode: "deep_research" as const,
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: {
      status: "passed" as const,
      passedStrict: true,
      finalUniqueCitedSources: 5,
      requiredSources: 4,
    },
    citationStatus: { finalUniqueCitedSources: 5 },
  };

  it("should return completed_with_source_gaps when provider_error but citations exist", () => {
    const result = decideFinalResearchStatus({
      ...baseInput,
      providerError: new Error("NVIDIA timeout"),
      citedSources: 5,
    });
    assert.equal(result, "completed_with_source_gaps");
  });

  it("should return provider_error when no citations exist", () => {
    const result = decideFinalResearchStatus({
      ...baseInput,
      sourceContract: { ...baseInput.sourceContract, finalUniqueCitedSources: 0, status: "failed" as const },
      citationStatus: { finalUniqueCitedSources: 0 },
      providerError: new Error("All providers failed"),
    });
    assert.equal(result, "failed");
  });

  it("should return legacy_fallback_used when degradedFallbackUsed and providerError with citations", () => {
    const result = decideFinalResearchStatus({
      ...baseInput,
      providerError: new Error("Primary failed"),
      degradedFallbackUsed: true,
    });
    assert.equal(result, "legacy_fallback_used");
  });

  it("should return completed when everything passes", () => {
    const result = decideFinalResearchStatus({
      ...baseInput,
      qualityGate: { passed: true, repairRequired: false },
    });
    assert.equal(result, "completed");
  });

  it("should return failed when citedSources is 0 regardless of providerError", () => {
    const result = decideFinalResearchStatus({
      ...baseInput,
      sourceContract: { ...baseInput.sourceContract, finalUniqueCitedSources: 0, status: "failed" as const },
      citationStatus: { finalUniqueCitedSources: 0 },
      providerError: new Error("fail"),
    });
    assert.equal(result, "failed");
  });
});
