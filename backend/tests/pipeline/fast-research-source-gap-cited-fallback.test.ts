import { describe, it, beforeEach } from "node:test";
import { expect } from "../helpers/expect.js";
import { EvidenceRegistryCore, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";

describe("Fast Research Citation-Eligible Source Requirements", () => {
  let registry: EvidenceRegistryCore;
  let agendaContract: ReturnType<typeof buildAgendaContract>;

  beforeEach(() => {
    agendaContract = buildAgendaContract({
      originalUserQuery: "India democratic space and Parliament test agenda",
      outputDepth: "brief",
    });
    registry = new EvidenceRegistryCore(agendaContract);
  });

  describe("Minimum citation-eligible sources", () => {
    it("should provide at least 3 citation-eligible sources for fast_research to proceed", () => {
      // Add 5 citation-eligible sources
      for (let i = 1; i <= 5; i++) {
        registry.addSource({
          title: `Source ${i}`,
          url: `https://example.com/${i}`,
          canonicalUrl: `https://example.com/${i}`,
          domain: "example.com",
          bucketIds: ["court_legal"],
          sourceClass: "court_primary",
          authorityScore: 85,
          date: new Date().toISOString(),
          fullText: `Full text for source ${i}`,
          snippet: `Snippet for source ${i}`,
          extractionQuality: "full",
          discoveredBy: ["test"],
          extractedBy: "test",
          keyFacts: [`Fact ${i}`],
          keyNumbers: [],
          legalHoldings: [],
          namedEntities: [],
          limitations: [],
          confidence: "high",
          citationEligible: true,
        });
      }

      const citationEligible = registry.getCitationEligibleSources();
      expect(citationEligible.length).toBeGreaterThanOrEqual(3);
      expect(citationEligible.length).toBe(5);
    });

    it("should fail when fewer than 3 citation-eligible sources available", () => {
      // Add only 2 citation-eligible sources
      for (let i = 1; i <= 2; i++) {
        registry.addSource({
          title: `Source ${i}`,
          url: `https://example.com/${i}`,
          canonicalUrl: `https://example.com/${i}`,
          domain: "example.com",
          bucketIds: ["court_legal"],
          sourceClass: "court_primary",
          authorityScore: 85,
          date: new Date().toISOString(),
          fullText: `Full text for source ${i}`,
          snippet: `Snippet for source ${i}`,
          extractionQuality: "full",
          keyFacts: [`Fact ${i}`],
          keyNumbers: [],
          legalHoldings: [],
          namedEntities: [],
          limitations: [],
          confidence: "high",
          citationEligible: true,
        });
      }

      const citationEligible = registry.getCitationEligibleSources();
      expect(citationEligible.length).toBeLessThan(3);
    });

    it("should handle low-authority sources correctly", () => {
      // Add sources with varying authority scores
      const sources: Partial<EvidenceSource>[] = [
        {
          title: "High Authority Source",
          url: "https://court.gov.in/case1",
          canonicalUrl: "https://court.gov.in/case1",
          domain: "court.gov.in",
          bucketIds: ["court_legal"],
          sourceClass: "court_primary",
          authorityScore: 95, // High
          fullText: "High authority text",
          snippet: "High authority snippet",
          extractionQuality: "full",
          keyFacts: ["Court ruling"],
          keyNumbers: [],
          legalHoldings: [],
          namedEntities: [],
          limitations: [],
          confidence: "high",
          citationEligible: true,
        },
        {
          title: "Low Authority Source",
          url: "https://lowauth.com/article",
          canonicalUrl: "https://lowauth.com/article",
          domain: "lowauth.com",
          bucketIds: ["social_media"],
          sourceClass: "social_media",
          authorityScore: 30, // Below threshold (40)
          fullText: "Low authority text",
          snippet: "Low authority snippet",
          extractionQuality: "snippet",
          keyFacts: ["Social post"],
          keyNumbers: [],
          legalHoldings: [],
          namedEntities: [],
          limitations: [],
          confidence: "low",
          citationEligible: false,
        },
      ];

      for (const source of sources) {
        registry.addSource({
          ...source,
          bucketIds: source.bucketIds ?? ["general"],
          sourceClass: source.sourceClass ?? "social_media",
          date: null,
          extractedBy: "test",
          discoveredBy: ["test"],
        } as any);
      }

      const citationEligible = registry.getCitationEligibleSources();
      // Should have 1 high-authority source, low-authority automatically marked ineligible
      expect(citationEligible.length).toBe(1);
      expect(citationEligible[0].authorityScore).toBeGreaterThanOrEqual(40);
    });
  });

  describe("Citation-eligible source tracking", () => {
    it("should correctly count citation-eligible sources", () => {
      // Add mix of eligible and ineligible sources
      for (let i = 1; i <= 10; i++) {
        registry.addSource({
          title: `Source ${i}`,
          url: `https://example.com/${i}`,
          canonicalUrl: `https://example.com/${i}`,
          domain: "example.com",
          bucketIds: ["court_legal"],
          sourceClass: "court_primary",
          authorityScore: i > 5 ? 85 : 25, // First 5 below threshold
          date: new Date().toISOString(),
          fullText: `Full text ${i}`,
          snippet: `Snippet ${i}`,
          extractionQuality: "full",
          keyFacts: [`Fact ${i}`],
          keyNumbers: [],
          legalHoldings: [],
          namedEntities: [],
          limitations: [],
          confidence: "high",
          citationEligible: i > 5,
        });
      }

      const count = registry.getCitationEligibleCount();
      expect(count).toBe(5);
    });

    it("should provide getCitationEligibleSources() for selection", () => {
      for (let i = 1; i <= 8; i++) {
        registry.addSource({
          title: `Source ${i}`,
          url: `https://example.com/${i}`,
          canonicalUrl: `https://example.com/${i}`,
          domain: "example.com",
          bucketIds: ["court_legal"],
          sourceClass: "court_primary",
          authorityScore: 85,
          date: new Date().toISOString(),
          fullText: `Text ${i}`,
          snippet: `Snippet ${i}`,
          extractionQuality: "full",
          keyFacts: [`Fact ${i}`],
          keyNumbers: [],
          legalHoldings: [],
          namedEntities: [],
          limitations: [],
          confidence: "high",
          citationEligible: true,
        });
      }

      const sources = registry.getCitationEligibleSources();
      expect(sources).toHaveLength(8);
      expect(sources.every((s) => s.citationEligible)).toBe(true);
    });
  });
});
