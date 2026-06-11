import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeToCanonicalId,
  getDivisionNumber,
  buildTextMapFromOutputs,
} from "../../src/core/synthesis/synthesis-engine/division-output-keying.js";
import { CANONICAL_DIVISION_IDS } from "../../src/core/synthesis/synthesis-engine/types.js";
import type { CanonicalDivisionId, DivisionOutput } from "../../src/core/synthesis/synthesis-engine/types.js";
import { formatDivisionContextForPrompt } from "../../src/core/synthesis/synthesis-engine/division-output-orchestrator.js";

describe("Brick 18 — Synthesis Engine Phase 1", () => {
  describe("Division output keying (B18-34)", () => {
    it("should normalize canonical IDs to themselves", () => {
      for (const id of CANONICAL_DIVISION_IDS) {
        assert.equal(normalizeToCanonicalId(id), id);
      }
    });

    it("should normalize D<n>_<id> format to canonical ID", () => {
      assert.equal(normalizeToCanonicalId("D1_core_brief"), "core_brief");
      assert.equal(normalizeToCanonicalId("D7_debate_utility"), "debate_utility");
      assert.equal(normalizeToCanonicalId("D11_strategic_insights"), "strategic_insights");
    });

    it("should normalize D<n> format to canonical ID", () => {
      assert.equal(normalizeToCanonicalId("D1"), "core_brief");
      assert.equal(normalizeToCanonicalId("D7"), "debate_utility");
      assert.equal(normalizeToCanonicalId("D11"), "strategic_insights");
    });

    it("should return null for unknown keys", () => {
      assert.equal(normalizeToCanonicalId("D99"), null);
      assert.equal(normalizeToCanonicalId("unknown_division"), null);
    });

    it("should return correct division numbers", () => {
      assert.equal(getDivisionNumber("core_brief"), 1);
      assert.equal(getDivisionNumber("debate_utility"), 7);
      assert.equal(getDivisionNumber("strategic_insights"), 11);
    });

    it("should have exactly 11 canonical division IDs", () => {
      assert.equal(CANONICAL_DIVISION_IDS.length, 11);
    });
  });

  describe("Division text map builder (B18-34)", () => {
    it("should build single-key text map from DivisionOutput map", () => {
      const outputs = new Map<CanonicalDivisionId, DivisionOutput>();
      outputs.set("core_brief", makeDivisionOutput("core_brief", 1, "Core brief text"));
      outputs.set("debate_utility", makeDivisionOutput("debate_utility", 7, "D7 debate text"));

      const textMap = buildTextMapFromOutputs(outputs);

      assert.equal(textMap.size, 2);
      assert.equal(textMap.get("core_brief"), "Core brief text");
      assert.equal(textMap.get("debate_utility"), "D7 debate text");
      // No duplicate D7_debate_utility key
      assert.equal(textMap.has("D7_debate_utility"), false);
    });
  });

  describe("Division context format for prompt (B18-08)", () => {
    it("should produce DIVISION SYNTHESIS CONTEXT header", () => {
      const outputs = new Map<CanonicalDivisionId, DivisionOutput>();
      outputs.set("core_brief", makeDivisionOutput("core_brief", 1, "Some core brief synthesis text with enough content."));
      outputs.set("debate_utility", makeDivisionOutput("debate_utility", 7, "Some D7 debate utility synthesis."));

      const context = formatDivisionContextForPrompt(outputs);

      assert.match(context, /DIVISION SYNTHESIS CONTEXT \(D1-D11\)/);
      assert.match(context, /\[D1 core_brief\]/);
      assert.match(context, /\[D7 debate_utility\]/);
      assert.match(context, /Some core brief synthesis text/);
    });

    it("should return empty string for empty outputs", () => {
      const outputs = new Map<CanonicalDivisionId, DivisionOutput>();

      const context = formatDivisionContextForPrompt(outputs);

      assert.equal(context, "");
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
