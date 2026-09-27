import test from "node:test";
import assert from "node:assert/strict";
import { decideFinalResearchStatus } from "../../src/core/pipeline/final-status.js";

const sourceGapContract = {
  requiredSources: 40,
  citationEligibleSources: 15,
  finalUniqueCitedSources: 15,
  passedStrict: false,
  passedWithSourceGaps: true,
  passed: true,
  status: "passed_with_source_gaps" as const,
  reason: "Source gap report permits partial status.",
};

test("source gaps do not mask hallucination or legal validation failures", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: sourceGapContract,
    sourceGapReport: { explanation: "Only 15 eligible sources found." },
    qualityGate: { passed: false, score: 72, repairRequired: true, fatalIssues: ["hallucination guard residual"] },
    citationStatus: { finalUniqueCitedSources: 15 },
    sourceUsageFailureReports: [{ roleName: "evidence_extractor" }],
  }), "failed");

  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: sourceGapContract,
    sourceGapReport: { explanation: "Only 15 eligible sources found." },
    qualityGate: { passed: false, score: 72, repairRequired: true, automaticFailures: ["legal_accuracy: unsupported Article 21 holding"] },
    citationStatus: { finalUniqueCitedSources: 15 },
    sourceUsageFailureReports: [{ roleName: "evidence_extractor" }],
  }), "failed");
});

test("mode_depth fatal still allows completed_with_source_gaps when an answer exists", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: sourceGapContract,
    sourceGapReport: { explanation: "Only 15 eligible sources found." },
    qualityGate: {
      passed: false,
      score: 69,
      repairRequired: true,
      fatalIssues: ["mode_depth: 15 cited sources below mode minimum 40"],
      automaticFailures: ["mode_depth: 15 cited sources below mode minimum 40"],
    },
    citationStatus: { finalUniqueCitedSources: 15 },
    sourceUsageFailureReports: [{ roleName: "evidence_extractor" }],
    visibleAnswer: "Parliamentary brief with citations across the floor.",
  }), "completed_with_source_gaps");

  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: sourceGapContract,
    sourceGapReport: { explanation: "Only 15 eligible sources found." },
    qualityGate: {
      passed: false,
      score: 69,
      repairRequired: true,
      fatalIssues: [
        "mode_depth: 15 cited sources below mode minimum 40",
        "legal_accuracy: unsupported Article 21 holding",
      ],
      automaticFailures: ["legal_accuracy: unsupported Article 21 holding"],
    },
    citationStatus: { finalUniqueCitedSources: 15 },
    sourceUsageFailureReports: [{ roleName: "evidence_extractor" }],
    visibleAnswer: "Parliamentary brief with citations across the floor.",
  }), "failed");
});

test("genuine source-gap completion still succeeds without safety validation failures", () => {
  assert.equal(decideFinalResearchStatus({
    mode: "fast_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract: sourceGapContract,
    sourceGapReport: { explanation: "Only 15 eligible sources found." },
    qualityGate: { passed: false, score: 69, repairRequired: true },
    citationStatus: { finalUniqueCitedSources: 15 },
    sourceUsageFailureReports: [{ roleName: "evidence_extractor" }],
  }), "completed_with_source_gaps");
});
