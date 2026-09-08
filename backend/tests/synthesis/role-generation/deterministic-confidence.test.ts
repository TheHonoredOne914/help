import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicRoleUsageItems } from "../../../src/core/synthesis/role-generation/deterministic-role-runner.js";
import { makeCard } from "./helpers.js";

test("deterministic role runner preserves evidence quality in confidence", () => {
  const items = buildDeterministicRoleUsageItems([
    makeCard(1, { citationStrength: "strong", extractionQuality: "full" }),
    makeCard(2, { citationStrength: "medium", extractionQuality: "partial" }),
    makeCard(3, {
      citationStrength: "weak",
      extractionQuality: "snippet",
      limitedSource: true,
      keyFacts: ["The Election Commission asked platforms to label political ads and deepfakes during elections with clear provenance."],
      contentPreview: "The Election Commission asked platforms to label political ads and deepfakes during elections with clear provenance.",
      topChunks: [{ text: "The Election Commission asked platforms to label political ads and deepfakes during elections with clear provenance.", score: 8 }],
    }),
  ], 3);

  assert.equal(items[0]?.confidence, "high");
  assert.equal(items[1]?.confidence, "medium");
  assert.equal(items[2]?.confidence, "low");
  // Substantive citation-eligible snippets now extract (low confidence), not auto-demote to weak.
  assert.equal(items[2]?.usageType, "fact_extracted");
});

test("deterministic role runner prefers countable evidence over weak leading cards", () => {
  const items = buildDeterministicRoleUsageItems([
    makeCard(1, {
      citationStrength: "weak",
      extractionQuality: "snippet",
      limitedSource: true,
      keyFacts: ["Title-only relevance: background mention."],
      contentPreview: "Title-only relevance: background mention.",
      debateUse: "Title-only relevance: background mention.",
      topChunks: [{ text: "Title-only relevance: background mention.", score: 1 }],
    }),
    makeCard(2, { citationStrength: "strong", extractionQuality: "full", sourceClass: "official_government" }),
    makeCard(3, { citationStrength: "medium", extractionQuality: "partial", sourceClass: "court_primary", legalHoldings: ["The Supreme Court applied proportionality to the restriction."] }),
  ], 2);

  assert.deepEqual(items.map((item) => item.sourceId).slice(0, 2), [2, 3]);
  assert.equal(items.slice(0, 2).every((item) => item.usageType !== "relevant_but_weak"), true);
});

test("deterministic role runner diversifies countable sources before same-class repeats", () => {
  const items = buildDeterministicRoleUsageItems([
    makeCard(1, { sourceClass: "official_government" }),
    makeCard(2, { sourceClass: "official_government" }),
    makeCard(3, { sourceClass: "policy_research" }),
    makeCard(4, { sourceClass: "court_primary", legalHoldings: ["The court set a binding legal standard."] }),
  ], 3);

  assert.deepEqual(items.map((item) => item.sourceId).slice(0, 3), [1, 3, 4]);
});
