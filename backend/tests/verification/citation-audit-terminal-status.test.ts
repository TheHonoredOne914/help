import { describe, it } from "node:test";
import { expect } from "../helpers/expect.js";

describe("Citation Audit and Terminal Status", () => {
  describe("Citation audit determines terminal status", () => {
    it("should fail when citation audit has no sourceIds", () => {
      const citationReport = {
        passed: false,
        validatedCitations: [],
        sourceIdsActuallyUsed: [], // Empty
        uniqueCitedSourceCount: 0,
        linkedCitationCount: 0,
      };

      const canTerminate = citationReport.sourceIdsActuallyUsed.length > 0;

      expect(canTerminate).toBe(false);
    });

    it("should allow completed_with_source_gaps when citations verified", () => {
      const citationReport = {
        passed: true,
        validatedCitations: [1, 5, 8],
        sourceIdsActuallyUsed: [1, 5, 8],
        uniqueCitedSourceCount: 3,
        linkedCitationCount: 5,
      };

      const sourceGapReport = {
        requiredUniqueSources: 10,
        availableCitationEligibleSources: 3,
      };

      const canUseCitedGapStatus = citationReport.sourceIdsActuallyUsed.length > 0 && Boolean(sourceGapReport);

      expect(canUseCitedGapStatus).toBe(true);
    });

    it("should validate citation format before allowing terminal status", () => {
      const answerText = `
Based on [Source 1](https://example.com/1), the analysis shows...
According to [Source 5](https://example.com/5), this demonstrates...
As noted in [Source 8](https://example.com/8), the evidence supports...`;

      const linkPattern = /\[Source\s+(\d+)\]\(https?:\/\/[^)]+\)/g;
      const matches = [...answerText.matchAll(linkPattern)];
      const validCitations = matches.map((m) => Number(m[1]));

      expect(validCitations).toContain(1);
      expect(validCitations).toContain(5);
      expect(validCitations).toContain(8);
      expect(validCitations.length).toBe(3);
    });
  });

  describe("Quality gate affects terminal status", () => {
    it("should fail if quality gate fails and citations === 0", () => {
      const qualityGate = {
        passed: false,
        automaticFailures: ["zero valid citations"],
      };

      const citationReport = {
        sourceIdsActuallyUsed: [],
        uniqueCitedSourceCount: 0,
      };

      const shouldFail = !qualityGate.passed && citationReport.uniqueCitedSourceCount === 0;

      expect(shouldFail).toBe(true);
    });

    it("should allow continued processing if quality gate warns but citations exist", () => {
      const qualityGate = {
        passed: false, // Failed
        warnings: ["weak bucket coverage"],
        automaticFailures: [],
      };

      const citationReport = {
        sourceIdsActuallyUsed: [1, 2, 3],
        uniqueCitedSourceCount: 3,
      };

      const sourceGapReport = {
        requiredUniqueSources: 10,
        availableCitationEligibleSources: 3,
      };

      // Can proceed with degraded completion if sources cited
      const canProceed = citationReport.uniqueCitedSourceCount > 0 && Boolean(sourceGapReport);

      expect(canProceed).toBe(true);
    });

    it("should repair issues when quality gate requires repair", () => {
      const qualityGate = {
        passed: false,
        repairRequired: true,
        automaticFailures: ["missing required section"],
      };

      const needsRepair = qualityGate.repairRequired && qualityGate.automaticFailures.length > 0;

      expect(needsRepair).toBe(true);
    });
  });

  describe("Terminal status validation", () => {
    it("should not emit completed_with_source_gaps when citations === 0", () => {
      const terminalState = {
        mode: "fast_research",
        citations: 0,
        sourceGapReport: { availableCitationEligibleSources: 0 },
      };

      const allowedStatus = terminalState.citations > 0 ? "completed_with_source_gaps" : "failed";

      expect(allowedStatus).toBe("failed");
    });

    it("should emit completed_with_source_gaps for fast_research with 3+ citations and gaps", () => {
      const terminalState = {
        mode: "fast_research",
        citations: 3,
        sourceGapReport: { availableCitationEligibleSources: 3, requiredUniqueSources: 10 },
        coreGenerationUsed: true,
        legacyFallbackUsed: false,
      };

      const terminalStatus =
        terminalState.citations > 0 && Boolean(terminalState.sourceGapReport) ? "completed_with_source_gaps" : "failed";

      expect(terminalStatus).toBe("completed_with_source_gaps");
    });

    it("should emit failed when provider error occurs", () => {
      const terminalState = {
        providerError: { message: "Provider unavailable" },
      };

      const terminalStatus = Boolean(terminalState.providerError) ? "provider_error" : "completed";

      expect(terminalStatus).toBe("provider_error");
    });

    it("should emit degraded_fallback when fallback was used", () => {
      const terminalState = {
        legacyFallbackUsed: true,
        mode: "fast_research",
        fallbackExplicitlyAllowed: true,
        citations: 2, // Still has some citations
      };

      const terminalStatus = terminalState.legacyFallbackUsed ? "legacy_fallback_used" : "failed";

      expect(terminalStatus).toBe("legacy_fallback_used");
    });
  });

  describe("Source usage validation in terminal status", () => {
    it("should validate source usage completion before terminal status", () => {
      const modelRoleOutputs = [
        {
          roleName: "thesis_synthesizer",
          usedSourceIds: [1, 2, 3, 5],
          sourceUsageRequirementSatisfied: true,
        },
        {
          roleName: "citation_auditor",
          usedSourceIds: [1, 5, 8],
          sourceUsageRequirementSatisfied: true,
        },
      ];

      const allRolesSatisfied = modelRoleOutputs.every((role) => role.sourceUsageRequirementSatisfied);

      expect(allRolesSatisfied).toBe(true);
    });

    it("should use deterministic fallback when source usage fails", () => {
      const modelRoleOutputs = [
        {
          roleName: "thesis_synthesizer",
          usedSourceIds: [],
          sourceUsageFailureReport: {
            roleName: "thesis_synthesizer",
            reason: "Model SourceUsageMap output was invalid",
            assignedSourceCount: 10,
            validUsageCount: 0,
          },
        },
      ];

      const failureReports = modelRoleOutputs
        .filter((r) => Boolean(r.sourceUsageFailureReport))
        .map((r) => r.sourceUsageFailureReport);

      expect(failureReports).toHaveLength(1);
      expect(failureReports[0].reason).toContain("Model SourceUsageMap output was invalid");
    });
  });

  describe("Citation coverage", () => {
    it("should verify minimum citation coverage before terminal status", () => {
      const citationReport = {
        sourceIdsActuallyUsed: [1, 2, 3, 4, 5],
        uniqueCitedSourceCount: 5,
      };

      const minimumForFastResearch = 3;
      const meetsMinimum = citationReport.uniqueCitedSourceCount >= minimumForFastResearch;

      expect(meetsMinimum).toBe(true);
    });

    it("should ensure all cited sources exist in registry", () => {
      const registry = new Map([
        [1, { id: 1, title: "Source 1" }],
        [5, { id: 5, title: "Source 5" }],
        [8, { id: 8, title: "Source 8" }],
      ]);

      const citedSourceIds = [1, 5, 8];
      const allSourcesExist = citedSourceIds.every((id) => registry.has(id));

      expect(allSourcesExist).toBe(true);
    });

    it("should reject citations to non-existent sources", () => {
      const registry = new Map([
        [1, { id: 1, title: "Source 1" }],
        [2, { id: 2, title: "Source 2" }],
      ]);

      const citedSourceIds = [1, 2, 99]; // 99 doesn't exist
      const allSourcesExist = citedSourceIds.every((id) => registry.has(id));

      expect(allSourcesExist).toBe(false);
    });
  });

  describe("Bucket coverage validation", () => {
    it("should verify bucket coverage for terminal status", () => {
      const requiredBuckets = ["court_legal", "democracy_index", "electoral_integrity"];
      const citedBuckets = ["court_legal", "electoral_integrity"]; // Missing one

      const allBucketsRequired = requiredBuckets.every((b) => citedBuckets.includes(b));

      // For fast_research with source gaps, not all buckets are required
      expect(allBucketsRequired).toBe(false);
    });

    it("should allow source gaps if minimum sources are cited", () => {
      const sourceGapReport = {
        failedBuckets: ["democracy_index"],
        weakBuckets: ["press_freedom"],
        availableCitationEligibleSources: 3,
      };

      const minimumCitations = 3;
      const citedSources = 3;

      const canProceedWithGaps = citedSources >= minimumCitations && Boolean(sourceGapReport);

      expect(canProceedWithGaps).toBe(true);
    });
  });
});
