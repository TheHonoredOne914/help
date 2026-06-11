import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getClaimCapForDivision } from "../../src/core/synthesis/synthesis-engine/claim-context-builder.js";
import { validateDivisionOutput, validateAllDivisionOutputs } from "../../src/core/synthesis/synthesis-engine/division-quality-gate.js";
import type { CanonicalDivisionId, DivisionOutput } from "../../src/core/synthesis/synthesis-engine/types.js";

describe("Brick 18 — Synthesis Engine Phase 2", () => {
  describe("Per-division claim caps (B18-29)", () => {
    it("should have different caps for different divisions", () => {
      const d7Cap = getClaimCapForDivision("debate_utility");
      const d1Cap = getClaimCapForDivision("core_brief");
      const d6Cap = getClaimCapForDivision("evidence_verification");
      assert.ok(d7Cap > d1Cap, "D7 should have higher cap than D1");
      assert.ok(d6Cap > d1Cap, "D6 should have higher cap than D1");
      assert.equal(d7Cap, 10, "D7 debate utility should have cap of 10");
      assert.equal(d6Cap, 10, "D6 evidence verification should have cap of 10");
      assert.equal(d1Cap, 5, "D1 core brief should have cap of 5");
    });
  });

  describe("Division quality gate — all 11 divisions (B18-25, B18-26)", () => {
    it("should pass a well-formed D7 output", () => {
      const output = makeD7Output(
        "Treasury Bench defence: the government maintains that this policy is constitutionally valid and serves public order. " +
        "Opposition challenge: the opposition argues that rights are disproportionately affected without adequate safeguards. " +
        "POI: Which exact source proves the central legal claim made by the treasury bench position? " +
        "Rebuttal: If methodology is attacked, concede limits and pivot to cross-source corroboration using registry evidence. " +
        "Coalition strategy and amendment proposals based on ClaimGraph evidence from multiple sources. " +
        "Red lines and negotiation points grounded in ClaimLedger claims that have been verified against the evidence registry.",
      );
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, true, `Issues: ${result.issues.join("; ")}`);
    });

    it("should fail a D7 output missing required markers", () => {
      const output = makeD7Output("This is just a generic paragraph without any debate utility content.");
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, false);
      assert.ok(result.issues.some((issue) => /missing required content/i.test(issue)));
    });

    it("should fail an empty output", () => {
      const output = makeDivisionOutput("core_brief", 1, "");
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, false);
      assert.ok(result.issues.some((issue) => /empty/i.test(issue)));
    });

    it("should fail a source gap placeholder", () => {
      const output = makeDivisionOutput("core_brief", 1, "Source gap.");
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, false);
    });

    it("should fail an output below minimum word count", () => {
      const output = makeDivisionOutput("core_brief", 1, "Too short.");
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, false);
      assert.ok(result.issues.some((issue) => /words/i.test(issue)));
    });

    it("should validate ALL 11 divisions, not just D7/D11", () => {
      const outputs = new Map<CanonicalDivisionId, DivisionOutput>();
      const divisions: CanonicalDivisionId[] = [
        "core_brief", "analytical_dimensions", "stakeholder_mapping",
        "conflict_mapping", "narrative_analysis", "evidence_verification",
        "debate_utility", "policy_pathways", "predictive_analysis",
        "resolution_support", "strategic_insights",
      ];
      for (const id of divisions) {
        outputs.set(id, makeDivisionOutput(id, divisions.indexOf(id) + 1, "Too short."));
      }
      const { passed, totalIssues, results } = validateAllDivisionOutputs(outputs);
      assert.equal(passed, false);
      assert.equal(results.size, 11, "All 11 divisions should be validated");
      assert.ok(totalIssues.length >= 11, "Each division should have at least one issue");
    });

    it("should validate D11 requires strategic/diagnosis content", () => {
      const output = makeDivisionOutput(
        "strategic_insights", 11,
        "This is a long paragraph that provides a lot of text but doesn't contain any strategic " +
        "or diagnostic content that the quality gate expects from Division 11.",
      );
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, false);
      assert.ok(result.issues.some((issue) => /missing required content/i.test(issue)));
    });

    it("should pass D11 with strategic content", () => {
      const output = makeDivisionOutput(
        "strategic_insights", 11,
        "Strategic diagnosis: The committee faces a fundamental tension between public order and civil liberties " +
        "that requires careful examination of constitutional provisions and judicial precedent. " +
        "Prescription: Treasury Bench should lead with court-backed evidence and official government positions. " +
        "Opposition should focus on proportionality arguments and evidence gaps in the registry. " +
        "Warning: Any claim without ClaimLedger support must be qualified as a source gap rather than asserted. " +
        "The winning frame combines constitutional morality with institutional accountability and committee oversight.",
      );
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, true, `Issues: ${result.issues.join("; ")}`);
    });
  });

  describe("Division quality gate — no source gap placeholder (B18-14, B18-31)", () => {
    it("should never return only 'Source gap.' as output", () => {
      const output = makeDivisionOutput("debate_utility", 7, "Source gap.");
      const result = validateDivisionOutput(output);
      assert.equal(result.passed, false, "Source gap placeholder must fail quality gate");
    });
  });
});

function makeDivisionOutput(
  divisionId: CanonicalDivisionId,
  divisionNumber: number,
  text: string,
): DivisionOutput {
  return {
    divisionId,
    divisionNumber,
    text,
    isFallback: false,
    qualityPassed: true,
    qualityIssues: [],
    claimCount: 0,
  };
}

function makeD7Output(text: string): DivisionOutput {
  return makeDivisionOutput("debate_utility", 7, text);
}
