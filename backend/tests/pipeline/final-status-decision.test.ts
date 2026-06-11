import test from "node:test";
import assert from "node:assert/strict";
import { decideFinalResearchStatus } from "../../src/core/pipeline/final-status.js";

const strictContract = {
  requiredSources: 20,
  citationEligibleSources: 25,
  finalUniqueCitedSources: 20,
  passedStrict: true,
  passedWithSourceGaps: false,
  passed: true,
  status: "passed" as const,
  reason: "Strict target met.",
};

const goodQualityGate = { passed: true, score: 91, repairRequired: false };

test("quality gate failure and repairRequired never become completed", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: strictContract,
    qualityGate: { passed: false, score: 78, repairRequired: false },
    citationStatus: { finalUniqueCitedSources: 20 },
  }), "failed");

  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: strictContract,
    qualityGate: { passed: true, score: 86, repairRequired: true },
    citationStatus: { finalUniqueCitedSources: 20 },
  }), "failed");
});

test("legacy fallback is warning in deep mode and failed in PhD/full modes", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: false,
    legacyFallbackUsed: true,
    sourceContract: strictContract,
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 20 },
    fallbackExplicitlyAllowed: true,
  }), "legacy_fallback_used");

  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: false,
    legacyFallbackUsed: true,
    sourceContract: { ...strictContract, requiredSources: 30, finalUniqueCitedSources: 30 },
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 30 },
    fallbackExplicitlyAllowed: true,
  }), "failed");
});

test("15 of 20 with a SourceGapReport is partial, without one is failed", () => {
  const partialContract = {
    requiredSources: 20,
    citationEligibleSources: 15,
    finalUniqueCitedSources: 15,
    passedStrict: false,
    passedWithSourceGaps: true,
    passed: true,
    status: "passed_with_source_gaps" as const,
    reason: "Source gap report permits partial status.",
  };

  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: partialContract,
    sourceGapReport: { explanation: "Only 15 eligible sources found." },
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 15 },
  }), "completed_with_source_gaps");

  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: { ...partialContract, passedWithSourceGaps: false, passed: false, status: "failed" },
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 15 },
  }), "failed");
});

test("zero citations fails and all gates passing completes", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: { ...strictContract, requiredSources: 10, finalUniqueCitedSources: 0, passedStrict: false, passed: false, status: "failed" },
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 0 },
  }), "failed");

  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: strictContract,
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 20 },
  }), "completed");
});

test("passed_with_source_gaps with repairRequired:true still completes with source gaps", () => {
  // Regression test: when sourceContract is passed_with_source_gaps but quality gate
  // sets repairRequired=true (e.g., score 69 vs fast_research minScore 70), the run should
  // still return completed_with_source_gaps, not "failed" - because the source gap handling
  // is designed to allow this case
  const sourceGapContract = {
    requiredSources: 10,
    citationEligibleSources: 2,
    finalUniqueCitedSources: 2,
    passedStrict: false,
    passedWithSourceGaps: true,
    passed: true,
    status: "passed_with_source_gaps" as const,
    reason: "Source gap report permits partial status.",
  };

  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: sourceGapContract,
    sourceGapReport: { explanation: "Only 2 eligible sources found." },
    qualityGate: { passed: false, score: 69, repairRequired: true },
    citationStatus: { finalUniqueCitedSources: 2 },
  }), "completed_with_source_gaps");
});

test("degraded deterministic fallback is normalized to explicit legacy fallback status", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    degradedFallbackUsed: true,
    sourceContract: { ...strictContract, requiredSources: 20, finalUniqueCitedSources: 7, passedStrict: false, passedWithSourceGaps: true, status: "passed_with_source_gaps" },
    sourceGapReport: { explanation: "Model under-cited, deterministic cited fallback used." },
    qualityGate: { passed: false, score: 70, repairRequired: false },
    citationStatus: { finalUniqueCitedSources: 7 },
  }), "legacy_fallback_used");

  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    degradedFallbackUsed: true,
    sourceContract: { ...strictContract, requiredSources: 20, finalUniqueCitedSources: 0, passedStrict: false, passedWithSourceGaps: false, passed: false, status: "failed" },
    sourceGapReport: { explanation: "No citations survived." },
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 0 },
  }), "failed");
});

test("evidence-backed deterministic cited fallback is completed with source gaps", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    deterministicCitedFallbackUsed: true,
    sourceContract: { ...strictContract, requiredSources: 20, finalUniqueCitedSources: 20 },
    qualityGate: goodQualityGate,
    citationStatus: { finalUniqueCitedSources: 20 },
  }), "completed");

  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    deterministicCitedFallbackUsed: true,
    sourceContract: { ...strictContract, requiredSources: 10, finalUniqueCitedSources: 10 },
    qualityGate: { passed: false, score: 74, repairRequired: true },
    citationStatus: { finalUniqueCitedSources: 10 },
  }), "completed_with_source_gaps");

  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    deterministicCitedFallbackUsed: true,
    sourceContract: { ...strictContract, requiredSources: 10, finalUniqueCitedSources: 10 },
    qualityGate: { passed: false, score: 74, repairRequired: true, fatalIssues: ["citation validation failed"] },
    citationStatus: { finalUniqueCitedSources: 10 },
  }), "failed");
});
