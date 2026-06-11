import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDeterministicDivisionFallback, validateD7DebateUtility } from "../../src/core/synthesis/division-quality.ts";

test("deterministic D7 fallback is marked as fallback and not placeholder text", () => {
  const fallback = buildDeterministicDivisionFallback("D7_debate_utility", {
    agenda: "Article 21 surveillance safeguards",
    reason: "model generation timed out",
    sourceAnchors: ["[Source 1](https://example.com/source-1)"],
  });

  assert.equal(fallback.isFallback, true);
  assert.match(fallback.text, /Deterministic fallback/i);
  assert.doesNotMatch(fallback.text, /placeholder|todo|lorem|insert/i);
});

test("fallback D7 is honest and does not pass as thesis-grade debate utility", () => {
  const fallback = buildDeterministicDivisionFallback("D7_debate_utility", {
    agenda: "Article 21 surveillance safeguards",
    reason: "provider_error",
    sourceAnchors: ["[Source 1](https://example.com/source-1)"],
  });
  const result = validateD7DebateUtility(fallback.text, { allowFallback: false });

  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /fallback/i.test(issue)));
});
