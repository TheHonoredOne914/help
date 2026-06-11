import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreClaimSupport, confidenceFromScore } from "../../src/core/evidence/claim-graph/claim-support-scorer.js";
import { KNOWN_VALID_ARTICLES } from "../../src/core/verification/legal-claim-validator.js";
import type { EvidenceClaim } from "../../src/core/evidence/claim-graph/types.js";

describe("Brick 18 — Synthesis Engine Phase 3", () => {
  describe("Empty sourceTrace guard (B18-22)", () => {
    it("should NOT give bonus to claims with empty sourceTrace", () => {
      const claimWithEmptyTrace: EvidenceClaim = {
        id: "test-1",
        text: "Test claim",
        type: "fact",
        requiredSourceClasses: [],
        supportingSourceIds: [1],
        confidence: "medium",
        mustUseCarefulLanguage: false,
        forbiddenIfUnsupported: false,
        sourceTrace: [],
      };
      const score = scoreClaimSupport(claimWithEmptyTrace);
      // Base: 10 (1 source) = 10; no trace bonuses
      assert.ok(score <= 10, `Empty trace should score ≤ 10, got ${score}`);
    });

    it("should give bonus to claims WITH valid sourceTrace", () => {
      const claimWithTrace: EvidenceClaim = {
        id: "test-2",
        text: "Test claim",
        type: "fact",
        requiredSourceClasses: [],
        supportingSourceIds: [1],
        confidence: "high",
        mustUseCarefulLanguage: false,
        forbiddenIfUnsupported: false,
        sourceTrace: [
          {
            sourceId: 1,
            sourceClass: "court_primary",
            citationStrength: "strong",
            extractionQuality: "full",
            validationStatus: "approved",
          },
        ],
      };
      const score = scoreClaimSupport(claimWithTrace);
      // Base: 10 (1 source) + 18 (approved) + 8 (all approved) + 15 (strong) + 8 (full) = 59
      assert.ok(score > 10, `Claim with trace should score > 10, got ${score}`);
    });
  });

  describe("Article whitelist expansion (B18-21)", () => {
    it("should include commonly referenced Articles", () => {
      const mustHave = ["23", "24", "30", "31", "38", "39", "39A", "44", "51", "73", "110", "143", "144", "200", "213", "243D", "243G", "246", "254", "280", "352", "360"];
      for (const article of mustHave) {
        assert.ok(KNOWN_VALID_ARTICLES.has(article), `Article ${article} should be in whitelist`);
      }
    });

    it("should still include original articles", () => {
      const originals = ["12", "13", "14", "15", "19", "21", "21A", "32", "124", "226", "356", "370"];
      for (const article of originals) {
        assert.ok(KNOWN_VALID_ARTICLES.has(article), `Original Article ${article} should remain in whitelist`);
      }
    });
  });

  describe("System prompt names ClaimGraph and ClaimLedger (B18-16)", () => {
    it("should contain ClaimGraph in the system prompt template", async () => {
      // Import the function and call it with minimal input
      const { buildCoreAnswerSystemPrompt } = await import("../../src/core/generation/core-answer-prompt.js");
      const prompt = buildCoreAnswerSystemPrompt({
        agendaContract: { topicType: "general_indian_policy", countryFocus: "india" } as any,
        evidenceRegistry: {} as any,
        evidencePacks: [],
        claimGraph: { claims: [] } as any,
        sourceUsageMaps: [],
        userQuery: "test",
        mode: "deep_research",
        requestId: "test",
      } as any);

      assert.match(prompt, /ClaimGraph/);
      assert.match(prompt, /ClaimLedger/);
    });
  });
});
