import test from "node:test";
import assert from "node:assert/strict";
import { canMergeResearchAnswerIntoArchive } from "../../src/core/archive/archive-merge-safety.js";

const strictContract = { passedStrict: true, status: "passed" as const };
const goodQuality = { passed: true, repairRequired: false };

test("archive merge only accepts strict completed validated answers", () => {
  assert.equal(canMergeResearchAnswerIntoArchive({
    terminalStatus: "completed",
    qualityGate: goodQuality,
    legacyFallbackUsed: false,
    sourceContract: strictContract,
    finalAnswer: "Validated Indian Mock Parliament answer.",
  }), true);
});

test("archive merge rejects fallback, failed, quality-failed, partial, and raw metadata answers", () => {
  const cases = [
    { terminalStatus: "failed" as const, qualityGate: goodQuality, legacyFallbackUsed: false, sourceContract: strictContract, finalAnswer: "Answer" },
    { terminalStatus: "legacy_fallback_used" as const, qualityGate: goodQuality, legacyFallbackUsed: true, sourceContract: strictContract, finalAnswer: "Answer" },
    { terminalStatus: "completed" as const, qualityGate: { passed: false, repairRequired: true }, legacyFallbackUsed: false, sourceContract: strictContract, finalAnswer: "Answer" },
    { terminalStatus: "completed_with_source_gaps" as const, qualityGate: goodQuality, legacyFallbackUsed: false, sourceContract: { passedStrict: false, status: "passed_with_source_gaps" as const }, finalAnswer: "Answer" },
    { terminalStatus: "completed" as const, qualityGate: goodQuality, legacyFallbackUsed: false, sourceContract: strictContract, finalAnswer: "Answer <!--BESTDEL_PIPELINE:{}-->" },
    { terminalStatus: "completed" as const, qualityGate: goodQuality, legacyFallbackUsed: false, sourceContract: strictContract, finalAnswer: "# Research Incomplete" },
  ];

  for (const item of cases) {
    assert.equal(canMergeResearchAnswerIntoArchive(item), false);
  }
});
