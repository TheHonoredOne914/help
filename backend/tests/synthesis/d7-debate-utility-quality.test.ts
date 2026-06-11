import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDebateUtilityDivision, validateD7DebateUtility } from "../../src/core/synthesis/division-quality.ts";
import type { EvidenceCard } from "../../src/core/evidence/evidence-pack-builder.ts";

function card(id: number, title = `Source ${id}`): EvidenceCard {
  return {
    sourceId: id,
    citation: `[Source ${id}](https://example.com/source-${id})`,
    title,
    url: `https://example.com/source-${id}`,
    sourceClass: "official_government",
    bucketIds: ["government_official"],
    date: "2026-01-01",
    relevanceScore: 0.9,
    keyFacts: [`Source ${id} documents a ministry accountability fact for parliamentary debate.`],
    keyNumbers: [],
    legalHoldings: [],
    governmentPosition: "Supports accountable legality with safeguards.",
    civilLibertiesPosition: "Challenges overbreadth and weak oversight.",
    electoralIntegrityPosition: null,
    debateUse: "Use for source-anchored Treasury and Opposition clash.",
    limitations: [`Source ${id} does not resolve every implementation question.`],
    usableSections: ["debate_utility"],
  };
}

test("D7 without POIs fails", () => {
  const result = validateD7DebateUtility([
    "D7 Debate Utility Arsenal",
    "Treasury Bench: defend accountable legality [Source 1](https://example.com/source-1).",
    "Opposition: challenge overbreadth [Source 2](https://example.com/source-2).",
    "Rebuttal Matrix:",
    "1. If security is invoked, demand proportionality review.",
    "2. If federalism is dismissed, cite state accountability.",
    "3. If rights are minimized, require judicial safeguards.",
    "4. If data is vague, demand ministry disclosure.",
    "5. If media is attacked, pivot to official records.",
    "Coalition Map: Treasury allies, Opposition bloc, cross-bench federal parties.",
    "Red Lines: no uncited fraud claims; no unlimited executive discretion.",
    "Amendment Language: require committee review.",
  ].join("\n"));

  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /POI/i.test(issue)));
});

test("D7 without rebuttals fails", () => {
  const pois = Array.from({ length: 6 }, (_, index) => `POI ${index + 1}: Which source proves claim ${index + 1}?`).join("\n");
  const result = validateD7DebateUtility([
    "D7 Debate Utility Arsenal",
    "Treasury Bench: defend accountable legality [Source 1](https://example.com/source-1).",
    "Opposition: challenge overbreadth [Source 2](https://example.com/source-2).",
    "POI Bank:",
    pois,
    "Coalition Map: Treasury allies, Opposition bloc, cross-bench federal parties.",
    "Red Lines: no uncited fraud claims; no unlimited executive discretion.",
    "Amendment Language: require committee review.",
  ].join("\n"));

  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /rebuttal/i.test(issue)));
});

test("D7 with strong POIs, rebuttals, coalition map, red lines, amendments, and citations passes", () => {
  const output = buildDebateUtilityDivision({
    agenda: "Article 21 surveillance safeguards",
    cards: [1, 2, 3, 4, 5, 6].map((id) => card(id)),
  });
  const result = validateD7DebateUtility(output);

  assert.equal(result.passed, true, result.issues.join("; "));
  assert.ok(result.metrics.poiCount >= 6);
  assert.ok(result.metrics.rebuttalCount >= 5);
  assert.ok(result.metrics.citationAnchorCount >= 6);
});
