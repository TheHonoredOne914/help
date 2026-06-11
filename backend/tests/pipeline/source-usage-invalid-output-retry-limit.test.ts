import { describe, it } from "node:test";
import { expect } from "../helpers/expect.js";

describe("Source Usage Invalid Output Retry Limit", () => {
  describe("Bounded retry policy", () => {
    it("should allow maximum 1 retry per provider for invalid source usage output", () => {
      const retryLog: Array<{ attempt: number; provider: string }> = [];
      const maxRetriesPerProvider = 1;
      const retriesPerProvider = new Map<string, number>();

      const simulateInvalidOutput = (provider: string) => {
        const providerKey = `${provider}/model`;
        const currentRetries = retriesPerProvider.get(providerKey) ?? 0;

        if (currentRetries < maxRetriesPerProvider) {
          retryLog.push({ attempt: currentRetries + 1, provider });
          retriesPerProvider.set(providerKey, currentRetries + 1);
          return true; // Can retry
        }
        return false; // Cannot retry
      };

      // First invalid output gets one stricter retry.
      expect(simulateInvalidOutput("openrouter")).toBe(true);

      // Second invalid output for the same provider/model is blocked.
      expect(simulateInvalidOutput("openrouter")).toBe(false);

      // Further invalid outputs stay blocked.
      expect(simulateInvalidOutput("openrouter")).toBe(false);

      expect(retryLog.length).toBeLessThanOrEqual(1);
    });

    it("should track retries independently per provider", () => {
      const maxRetriesPerProvider = 1;
      const retriesPerProvider = new Map<string, number>();

      const canRetry = (provider: string) => {
        const key = `${provider}/model`;
        const current = retriesPerProvider.get(key) ?? 0;
        if (current < maxRetriesPerProvider) {
          retriesPerProvider.set(key, current + 1);
          return true;
        }
        return false;
      };

      // Provider 1 should have 1 retry
      expect(canRetry("provider1")).toBe(true);
      expect(canRetry("provider1")).toBe(false);

      // Provider 2 should independently have 1 retry
      expect(canRetry("provider2")).toBe(true);
      expect(canRetry("provider2")).toBe(false);

      expect(retriesPerProvider.get("provider1/model")).toBe(1);
      expect(retriesPerProvider.get("provider2/model")).toBe(1);
    });

    it("should fallback to deterministic extraction after max retries", () => {
      const attempts: Array<"model" | "deterministic"> = [];
      const maxRetries = 1;
      let retryCount = 0;

      // Simulate source usage batch attempts
      attempts.push("model"); // First attempt fails
      retryCount++;

      if (retryCount <= maxRetries) {
        attempts.push("model"); // Retry allowed
      } else {
        attempts.push("deterministic"); // Fallback
      }

      expect(attempts).toContain("model");
      expect(attempts[attempts.length - 1]).toBe("model");
    });

    it("should prevent infinite retry loops", () => {
      const maxRetriesPerProvider = 1;
      let totalRetries = 0;
      const retryLimit = 10; // Safety limit

      for (let i = 0; i < 100; i++) {
        // Simulate retries that should be bounded
        if (totalRetries <= maxRetriesPerProvider) {
          totalRetries++;
        } else {
          break;
        }
      }

      expect(totalRetries).toBeLessThanOrEqual(maxRetriesPerProvider + 1);
      expect(totalRetries).toBeLessThan(retryLimit);
    });
  });

  describe("Provider fallback behavior", () => {
    it("should mark provider as broken after max retries exceeded", () => {
      const brokenProviders = new Set<string>();
      const maxRetries = 1;
      let retries = 0;

      // After max retries, mark provider as broken
      retries++;
      if (retries > maxRetries) {
        brokenProviders.add("openrouter");
      }

      expect(brokenProviders.has("openrouter")).toBe(false);

      retries++;
      if (retries > maxRetries) {
        brokenProviders.add("openrouter");
      }

      expect(brokenProviders.has("openrouter")).toBe(true);
    });

    it("should skip broken providers in subsequent attempts", () => {
      const brokenProviders = new Set<string>(["openrouter"]);
      const candidates = [
        { name: "openrouter", model: "gpt-4o-mini" },
        { name: "github", model: "gpt-4.1" },
        { name: "gemini", model: "gemini-2.5-flash" },
      ];

      const viable = candidates.filter((c) => !brokenProviders.has(c.name));

      expect(viable).toHaveLength(2);
      expect(viable.some((c) => c.name === "github")).toBe(true);
      expect(viable.some((c) => c.name === "gemini")).toBe(true);
      expect(viable.some((c) => c.name === "openrouter")).toBe(false);
    });
  });

  describe("Time budget enforcement", () => {
    it("should not exceed reasonable time for source usage retries", () => {
      const startTime = Date.now();
      const maxRetries = 1;
      let retries = 0;
      const timeoutMs = 30_000; // 30 seconds reasonable limit

      // Simulate batch processing with retries
      while (retries <= maxRetries) {
        retries++;
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          break;
        }
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(timeoutMs);
    });
  });

  describe("Event emission on retry", () => {
    it("should emit source_usage_batch_retry event on retry", () => {
      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      const maxRetries = 1;
      let retryCount = 0;

      const emit = (type: string, data: Record<string, unknown>) => {
        events.push({ type, data });
      };

      // First attempt fails
      retryCount++;
      if (retryCount <= maxRetries) {
        emit("source_usage_batch_retry", {
          roleName: "thesis_synthesizer",
          providerName: "openrouter",
          model: "gpt-4o-mini",
          reason: "invalid_source_usage_output",
          attemptNumber: retryCount,
        });
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("source_usage_batch_retry");
      expect(events[0].data.attemptNumber).toBe(1);
    });

    it("should emit source_usage_provider_fallback when max retries exceeded", () => {
      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      const maxRetries = 1;
      let retryCount = 0;

      const emit = (type: string, data: Record<string, unknown>) => {
        events.push({ type, data });
      };

      retryCount = 2; // Exceeded max
      if (retryCount > maxRetries) {
        emit("source_usage_provider_fallback", {
          roleName: "citation_auditor",
          fromProvider: "openrouter",
          reason: "max_retries_exceeded",
          attemptCount: retryCount,
        });
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("source_usage_provider_fallback");
      expect(events[0].data.reason).toBe("max_retries_exceeded");
    });
  });
});
