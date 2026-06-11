import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicRoleUsageItems } from "../../../src/core/synthesis/role-generation/deterministic-role-runner.js";
import { makeCard } from "./helpers.js";

test("deterministic role runner preserves evidence quality in confidence", () => {
  const items = buildDeterministicRoleUsageItems([
    makeCard(1, { citationStrength: "strong", extractionQuality: "full" }),
    makeCard(2, { citationStrength: "medium", extractionQuality: "partial" }),
    makeCard(3, { citationStrength: "weak", extractionQuality: "snippet", limitedSource: true }),
  ], 3);

  assert.equal(items[0]?.confidence, "high");
  assert.equal(items[1]?.confidence, "medium");
  assert.equal(items[2]?.confidence, "low");
  assert.equal(items[2]?.usageType, "relevant_but_weak");
});

test("deterministic role runner prefers countable evidence over weak leading cards", () => {
  const items = buildDeterministicRoleUsageItems([
    makeCard(1, { citationStrength: "weak", extractionQuality: "snippet", limitedSource: true, keyFacts: ["Title-only relevance: background mention."] }),
    makeCard(2, { citationStrength: "strong", extractionQuality: "full", sourceClass: "official_government" }),
    makeCard(3, { citationStrength: "medium", extractionQuality: "partial", sourceClass: "court_primary", legalHoldings: ["The Supreme Court applied proportionality to the restriction."] }),
  ], 2);

  assert.deepEqual(items.map((item) => item.sourceId), [2, 3]);
  assert.equal(items.every((item) => item.usageType !== "relevant_but_weak"), true);
});

test("deterministic role runner diversifies countable sources before same-class repeats", () => {
  const items = buildDeterministicRoleUsageItems([
    makeCard(1, { sourceClass: "official_government" }),
    makeCard(2, { sourceClass: "official_government" }),
    makeCard(3, { sourceClass: "policy_research" }),
    makeCard(4, { sourceClass: "court_primary", legalHoldings: ["The court set a binding legal standard."] }),
  ], 3);

  assert.deepEqual(items.map((item) => item.sourceId), [1, 3, 4]);
});
