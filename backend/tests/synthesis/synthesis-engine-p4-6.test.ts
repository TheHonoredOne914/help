import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkPromptBudget, getCompressionPriority, postForcedSourceBudgetCheck } from "../../src/core/synthesis/synthesis-engine/prompt-budget-protector.js";
import { getRolesForDivision, selectRoleOutputsForDivisionEngine } from "../../src/core/synthesis/synthesis-engine/role-output-router.js";
import { isLegacySynthesisAllowed, isSyntheticSourceAllowed } from "../../src/core/synthesis/synthesis-engine/legacy-synthesis-guard.js";

describe("Brick 18 — Synthesis Engine Phase 4-6", () => {
  describe("Prompt budget protector (B18-10)", () => {
    it("should report within budget for short prompts", () => {
      const result = checkPromptBudget("short prompt", 1000);
      assert.equal(result.withinBudget, true);
      assert.equal(result.compressionSuggestions.length, 0);
    });

    it("should report over budget for long prompts", () => {
      const longPrompt = "x".repeat(20000);
      const result = checkPromptBudget(longPrompt, 1000);
      assert.equal(result.withinBudget, false);
      assert.ok(result.compressionSuggestions.length > 0);
    });

    it("should suggest compressing raw_source_text first", () => {
      const longPrompt = "x".repeat(20000);
      const result = checkPromptBudget(longPrompt, 1000);
      assert.equal(result.compressionSuggestions[0], "raw_source_text");
    });

    it("should never suggest compressing output_contract", () => {
      const longPrompt = "x".repeat(20000);
      const result = checkPromptBudget(longPrompt, 1000);
      assert.ok(!result.compressionSuggestions.includes("output_contract"));
    });

    it("should compress ClaimGraph last among non-contract sections", () => {
      const priority = getCompressionPriority("claim_graph");
      const rawPriority = getCompressionPriority("raw_source_text");
      assert.ok(priority > rawPriority, "ClaimGraph should have higher priority (compressed later)");
    });
  });

  describe("Post-forced-source budget check (B18-45)", () => {
    it("should detect budget exceeded after forced sources", () => {
      const result = postForcedSourceBudgetCheck("x".repeat(20000), 1000);
      assert.equal(result.exceeded, true);
      assert.ok(result.overageTokens > 0);
      assert.equal(result.trimFirst, "raw_source_text");
    });

    it("should report no overage for short prompts", () => {
      const result = postForcedSourceBudgetCheck("short", 1000);
      assert.equal(result.exceeded, false);
      assert.equal(result.overageTokens, 0);
    });
  });

  describe("Per-division role routing (B18-09)", () => {
    it("should assign unique roles per division", () => {
      const d7Roles = getRolesForDivision("debate_utility");
      const d11Roles = getRolesForDivision("strategic_insights");
      const d6Roles = getRolesForDivision("evidence_verification");

      // D7 should have parliamentary strategist
      assert.ok(d7Roles.includes("indian_parliamentary_strategist"), "D7 should include parliamentary strategist");
      // D11 should have retrieval critic
      assert.ok(d11Roles.includes("retrieval_critic"), "D11 should include retrieval critic");
      // D6 should have citation auditor
      assert.ok(d6Roles.includes("citation_auditor"), "D6 should include citation auditor");
    });

    it("should not default all divisions to the same 3 roles", () => {
      const allRoles = new Set<string>();
      const divisions = [
        "core_brief", "analytical_dimensions", "stakeholder_mapping",
        "conflict_mapping", "narrative_analysis", "evidence_verification",
        "debate_utility", "policy_pathways", "predictive_analysis",
        "resolution_support", "strategic_insights",
      ] as const;

      const roleSets = new Set<string>();
      for (const div of divisions) {
        const roles = getRolesForDivision(div);
        roleSets.add(roles.sort().join(","));
        for (const role of roles) allRoles.add(role);
      }
      // At least 5 unique role sets across 11 divisions (not 1 shared set)
      assert.ok(roleSets.size >= 5, `Expected at least 5 unique role sets, got ${roleSets.size}`);
    });
  });

  describe("Legacy synthesis guard (B18-03, B18-32)", () => {
    it("should block legacy synthesis in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        assert.equal(isLegacySynthesisAllowed(), false);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("should allow legacy synthesis in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      try {
        assert.equal(isLegacySynthesisAllowed(), true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("should block synthetic sources in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        assert.equal(isSyntheticSourceAllowed({ allowSyntheticSourceUsage: true }), false);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("should require explicit flag for synthetic sources in test", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      try {
        assert.equal(isSyntheticSourceAllowed(), false);
        assert.equal(isSyntheticSourceAllowed({ allowSyntheticSourceUsage: true }), true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
