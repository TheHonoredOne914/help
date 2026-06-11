import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicRoleUsageItems } from "../../../src/core/synthesis/role-generation/deterministic-role-runner.js";
import { makeCard } from "./helpers.js";

test("deterministic role runner over-selects real card-backed items above the minimum", () => {
  const cards = Array.from({ length: 40 }, (_, index) => makeCard(index + 1));
  const items = buildDeterministicRoleUsageItems(cards, 20, "evidence_extractor");

  assert.equal(items.length, 30);
  assert.equal(new Set(items.map((item) => item.sourceId)).size, 30);
  assert.ok(items.every((item) => item.usageType !== "relevant_but_weak"));
});

test("deterministic role runner downgrades JavaScript placeholder evidence instead of extracting fake claims", () => {
  const placeholder = "Election Commission of India You need to enable JavaScript to run this app.";
  const items = buildDeterministicRoleUsageItems([
    makeCard(1, {
      keyFacts: [placeholder],
      topChunks: [{ text: placeholder, score: 9 }],
      contentPreview: placeholder,
      debateUse: placeholder,
      limitations: [],
      extractionQuality: "full",
      citationStrength: "strong",
    }),
  ], 1, "evidence_extractor");

  assert.equal(items.length, 1);
  assert.equal(items[0].usageType, "relevant_but_weak");
  assert.equal(items[0].extractedClaim, undefined);
  assert.match(items[0].limitation ?? "", /weak|background|context|evidence/i);
});
