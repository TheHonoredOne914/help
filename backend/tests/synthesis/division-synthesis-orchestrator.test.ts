import { test } from "node:test";
import assert from "node:assert/strict";

import { synthesizeQualityDivisions } from "../../src/core/synthesis/division-quality.ts";
import type { EvidenceCard } from "../../src/core/evidence/evidence-pack-builder.ts";

function card(id: number): EvidenceCard {
  return {
    sourceId: id,
    citation: `[Source ${id}](https://example.com/source-${id})`,
    title: `Registry source ${id}`,
    url: `https://example.com/source-${id}`,
    sourceClass: "policy_research",
    bucketIds: ["policy_research"],
    date: "2026-01-01",
    relevanceScore: 0.8,
    keyFacts: [`Registry source ${id} records committee-relevant evidence.`],
    keyNumbers: [],
    legalHoldings: [],
    governmentPosition: "Supports a narrow accountable policy defence.",
    civilLibertiesPosition: "Supports a rights-based oversight challenge.",
    electoralIntegrityPosition: null,
    debateUse: "Anchor POIs, rebuttals, and amendment drafting.",
    limitations: ["Does not decide every constitutional issue."],
    usableSections: ["debate_utility", "strategic_insights"],
  };
}

test("synthesis orchestrator returns D1-D11 outputs with D7 and D11 quality reports", () => {
  const result = synthesizeQualityDivisions({
    agenda: "Article 21 surveillance safeguards",
    cards: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => card(id)),
  });

  assert.equal(result.outputs.size, 11);
  assert.equal(result.quality.get("D7_debate_utility")?.passed, true);
  assert.equal(result.quality.get("D11_strategic_insights")?.passed, true);
  assert.equal(result.quality.get("D1_core_brief")?.passed, false);
  assert.ok(result.quality.get("D1_core_brief")?.issues.some((issue) => /scaffold/i.test(issue)));
  assert.match(result.outputs.get("D7_debate_utility") ?? "", /Coalition Map/i);
  assert.match(result.outputs.get("D11_strategic_insights") ?? "", /Diagnosis:/i);
});
