import { describe, it, beforeEach } from "node:test";
import { expect } from "../helpers/expect.js";
import { decideFinalResearchStatus, type DecideFinalResearchStatusInput } from "../../src/core/pipeline/final-status.js";

describe("Fast Research Zero-Citation Guard", () => {
  describe("completed_with_source_gaps validation", () => {
    it("should prevent completed_with_source_gaps when citations === 0 with sourceGapReport", () => {
      const input: DecideFinalResearchStatusInput = {
        mode: "fast_research",
        coreGenerationUsed: true,
        legacyFallbackUsed: false,
        sourceContract: {
          status: "passed_with_source_gaps",
          finalUniqueCitedSources: 0,
          requiredSources: 3,
          passedStrict: false,
        },
        sourceGapReport: {
          requiredUniqueSources: 10,
          availableCitationEligibleSources: 5,
          failedBuckets: [],
          weakBuckets: ["democracy_index"],
          attemptedQueries: ["test query"],
          providerErrors: [],
          enrichmentFailures: [],
          explanation: "Fewer sources than required",
          repairAttempted: true,
        },
        qualityGate: {
          passed: false,
        },
        citationStatus: {
          finalUniqueCitedSources: 0,
        },
      };

      const status = decideFinalResearchStatus(input);
      expect(status).toBe("failed");
    });

    it("should allow completed_with_source_gaps when citations > 0 with sourceGapReport", () => {
      const input: DecideFinalResearchStatusInput = {
        mode: "fast_research",
        coreGenerationUsed: true,
        legacyFallbackUsed: false,
        sourceContract: {
          status: "passed_with_source_gaps",
          finalUniqueCitedSources: 3,
          requiredSources: 10,
          passedStrict: false,
        },
        sourceGapReport: {
          requiredUniqueSources: 10,
          availableCitationEligibleSources: 3,
          failedBuckets: [],
          weakBuckets: ["democracy_index"],
          attemptedQueries: ["test query"],
          providerErrors: [],
          enrichmentFailures: [],
          explanation: "Fewer sources than required",
          repairAttempted: false,
        },
        qualityGate: {
          passed: true,
        },
        citationStatus: {
          finalUniqueCitedSources: 3,
        },
      };

      const status = decideFinalResearchStatus(input);
      expect(status).toBe("completed_with_source_gaps");
    });

    it("should return failed when citations === 0 without sourceGapReport", () => {
      const input: DecideFinalResearchStatusInput = {
        mode: "deep_research",
        coreGenerationUsed: true,
        legacyFallbackUsed: false,
        sourceContract: {
          status: "passed",
          finalUniqueCitedSources: 0,
          requiredSources: 10,
          passedStrict: true,
        },
        qualityGate: {
          passed: false,
        },
        citationStatus: {
          finalUniqueCitedSources: 0,
        },
      };

      const status = decideFinalResearchStatus(input);
      expect(status).toBe("failed");
    });

    it("should enforce the hard rule across all research modes", () => {
      const modes: Array<"fast_research" | "deep_research" | "deep_research" | "council"> = [
        "fast_research",
        "deep_research",
        "deep_research",
        "council",
      ];

      for (const mode of modes) {
        const input: DecideFinalResearchStatusInput = {
          mode,
          coreGenerationUsed: true,
          legacyFallbackUsed: false,
          sourceContract: {
            status: "passed_with_source_gaps",
            finalUniqueCitedSources: 0,
            requiredSources: 5,
            passedStrict: false,
          },
          sourceGapReport: { requiredUniqueSources: 20, availableCitationEligibleSources: 0, failedBuckets: [], weakBuckets: [], attemptedQueries: [], providerErrors: [], enrichmentFailures: [], explanation: "No sources", repairAttempted: false },
          citationStatus: { finalUniqueCitedSources: 0 },
        };

        const status = decideFinalResearchStatus(input);
        expect(status).toBe("failed", `Mode ${mode} should prevent completed_with_source_gaps when citations === 0`);
      }
    });
  });

  describe("terminal status validation", () => {
    it("should return failed when provider error exists", () => {
      const input: DecideFinalResearchStatusInput = {
        mode: "fast_research",
        coreGenerationUsed: false,
        legacyFallbackUsed: false,
        sourceContract: { status: "passed_with_source_gaps", finalUniqueCitedSources: 3, requiredSources: 3, passedStrict: false },
        providerError: { message: "Provider unavailable" },
        citationStatus: { finalUniqueCitedSources: 3 },
      };

      const status = decideFinalResearchStatus(input);
      expect(status).toBe("provider_error");
    });

    it("should return failed when quality gate fails and not source gaps", () => {
      const input: DecideFinalResearchStatusInput = {
        mode: "fast_research",
        coreGenerationUsed: true,
        legacyFallbackUsed: false,
        sourceContract: { status: "passed", finalUniqueCitedSources: 5, requiredSources: 5, passedStrict: false },
        qualityGate: { passed: false, automaticFailures: ["test failure"] },
        citationStatus: { finalUniqueCitedSources: 5 },
      };

      const status = decideFinalResearchStatus(input);
      expect(status).toBe("failed");
    });
  });
});
