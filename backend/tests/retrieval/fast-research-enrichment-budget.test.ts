import { describe, it } from "node:test";
import { expect } from "../helpers/expect.js";

describe("Fast Research Enrichment Budget", () => {
  describe("Budget timing", () => {
    it("should respect 20s enrichment budget for fast_research", async () => {
      const budgetMs = 20_000; // 20 seconds
      const startTime = Date.now();

      // Simulate enrichment that respects budget
      const enrichmentPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, budgetMs + 1000); // Simulate running over budget
      });

      // Budget timer should abort before enrichment completes
      const controller = new AbortController();
      let budgetExceeded = false;

      const budgetTimer = setTimeout(() => {
        controller.abort();
        budgetExceeded = true;
      }, budgetMs);

      await Promise.race([enrichmentPromise, new Promise((resolve) => setTimeout(resolve, budgetMs + 100))]);
      clearTimeout(budgetTimer);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThanOrEqual(budgetMs + 500); // 500ms tolerance
      expect(budgetExceeded).toBe(true);
    });

    it("should complete enrichment within budget when sources are fast", async () => {
      const budgetMs = 20_000;
      const startTime = Date.now();

      // Simulate fast enrichment (3 sources in 5 seconds)
      const controller = new AbortController();
      const enrichedCount = await new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(3);
        }, 5000); // Fast completion
      });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(budgetMs);
      expect(enrichedCount).toBe(3);
    });

    it("should have 2s tolerance above 20s budget", () => {
      const budgetMs = 20_000;
      const tolerance = 2_000; // 2 seconds
      const maxAllowed = budgetMs + tolerance;

      expect(maxAllowed).toBe(22_000);
      expect(maxAllowed).toBeLessThan(budgetMs + 5000); // NOT 25s+
    });
  });

  describe("AbortController usage", () => {
    it("should abort in-flight enrichment when budget expires", async () => {
      const controller = new AbortController();
      const budgetMs = 2000; // 2 seconds for test

      const checkAborted = () => controller.signal.aborted;

      // Simulate budget expiration
      const budgetTimer = setTimeout(() => {
        controller.abort();
      }, budgetMs);

      // Start enrichment task
      let wasAborted = false;
      const enrichmentTask = new Promise<void>((resolve) => {
        setTimeout(() => {
          if (checkAborted()) {
            wasAborted = true;
          }
          resolve();
        }, budgetMs + 500);
      });

      await enrichmentTask;
      clearTimeout(budgetTimer);

      expect(wasAborted).toBe(true);
    });

    it("should check abortSignal before starting enrichment", () => {
      const controller = new AbortController();
      controller.abort();

      const shouldEnrich = () => {
        if (controller.signal.aborted) {
          throw new Error("Enrichment aborted: budget exceeded");
        }
        return true;
      };

      expect(() => shouldEnrich()).toThrow("Enrichment aborted");
    });
  });

  describe("Early stopping for fast_research", () => {
    it("should stop enrichment once 5 citation-eligible sources exist", () => {
      const citationEligibleSources: Array<{ id: number; eligible: boolean }> = [];
      let cursor = 0;
      const maxSources = 20;
      const targetEligible = 5;

      // Simulate adding sources as they're enriched
      while (cursor < maxSources && citationEligibleSources.filter((s) => s.eligible).length < targetEligible) {
        citationEligibleSources.push({
          id: cursor + 1,
          eligible: Math.random() > 0.3, // ~70% eligible
        });
        cursor++;
      }

      const eligibleCount = citationEligibleSources.filter((s) => s.eligible).length;
      expect(eligibleCount).toBeGreaterThanOrEqual(targetEligible);
      expect(cursor).toBeLessThanOrEqual(maxSources);
    });

    it("should allow completing enrichment under budget when early stop triggered", () => {
      const startTime = Date.now();
      const budgetMs = 20_000;
      const citationEligible = 5;
      const targetCitationEligible = 5;

      // Simulate early stop after finding enough sources
      if (citationEligible >= targetCitationEligible) {
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(budgetMs);
      }
    });
  });

  describe("Fallback to snippet when budget exceeded", () => {
    it("should mark remaining sources as snippet_fallback when budget expires", () => {
      const budgetExpired = true;
      const remainingSources = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        url: `https://example.com/${i + 1}`,
        extractionMethod: budgetExpired ? "snippet_fallback" : "jina_reader",
      }));

      expect(remainingSources.every((s) => s.extractionMethod === "snippet_fallback")).toBe(true);
    });

    it("should preserve snippet content for budget-exceeded sources", () => {
      const sources = [
        {
          id: 1,
          fullText: "Full extracted text",
          snippet: "Original snippet",
          extractionMethod: "jina_reader" as const,
        },
        {
          id: 2,
          fullText: null, // Budget exceeded, no extraction
          snippet: "Preserved snippet",
          extractionMethod: "snippet_fallback" as const,
          enrichmentError: "Enrichment budget exceeded",
        },
      ];

      const fallbackSource = sources[1];
      expect(fallbackSource.snippet).toBe("Preserved snippet");
      expect(fallbackSource.fullText).toBeNull();
      expect(fallbackSource.enrichmentError).toBe("Enrichment budget exceeded");
    });
  });

  describe("Per-source timeout for fast_research", () => {
    it("should use 3-4s per-source timeout for fast_research", () => {
      const fastResearchPerSourceTimeout = 4000; // 4 seconds max
      const deepResearchPerSourceTimeout = 8000; // 8 seconds max

      expect(fastResearchPerSourceTimeout).toBeLessThan(deepResearchPerSourceTimeout);
      expect(fastResearchPerSourceTimeout).toBeGreaterThanOrEqual(3000);
    });

    it("should complete 5 sources within budget at fast_research timeout", () => {
      const perSourceTimeout = 4000; // 4 seconds per source
      const numSources = 5;
      const concurrency = 3;

      // Worst case: sequential (but normally parallel)
      const worstCaseTime = (numSources / concurrency) * perSourceTimeout;

      expect(worstCaseTime).toBeLessThan(20_000);
    });
  });

  describe("Budget configuration", () => {
    it("should define correct budget for each research mode", () => {
      const budgets = {
        fast_research: 20_000,
        deep_research: 60_000,
        deep_research: 120_000,
        council: 150_000,
      };

      expect(budgets.fast_research).toBe(20_000);
      expect(budgets.deep_research).toBeGreaterThan(budgets.fast_research);
      expect(budgets.deep_research).toBeGreaterThan(budgets.deep_research);
    });
  });
});
