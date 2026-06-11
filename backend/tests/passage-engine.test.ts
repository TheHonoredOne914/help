import test from "node:test";
import assert from "node:assert/strict";
import {
  deduplicatePassagesSemantically,
  semanticChunkDocument,
} from "../src/lib/passage-engine.js";

test("semanticChunkDocument tags evidence-dense legal passages", () => {
  const text = [
    "The Supreme Court held that Article 21 protects bodily autonomy in 2024 for survivors, children, and citizens seeking constitutional remedies.",
    "Section 6 of POCSO recorded 12,000 cases and the Court directed enforcement through police, prosecutors, and welfare institutions.",
  ].join("\n\n");

  const passages = semanticChunkDocument(text, "https://indiankanoon.org/doc/123", {
    sourceIndex: 3,
    sourceTitle: "Example judgement",
    sourceTier: "tier1",
  });

  assert.equal(passages.length, 1);
  assert.equal(passages[0].sourceIndex, 3);
  assert.equal(passages[0].containsCourtRef, true);
  assert.equal(passages[0].containsArticleRef, true);
  assert.equal(passages[0].containsNumber, true);
  assert.ok(passages[0].evidenceDensityScore > 0.4);
  assert.ok(passages[0].dimensionTags.includes("constitutional"));
});

test("deduplicatePassagesSemantically keeps the denser near-duplicate", () => {
  const [first] = semanticChunkDocument(
    "NCRB recorded 1,00,000 cases in 2023 under Section 5 with detailed statistics.",
    "https://ncrb.gov.in/report-a",
    { sourceIndex: 1, sourceTitle: "NCRB A", sourceTier: "tier2" },
  );
  const [second] = semanticChunkDocument(
    "NCRB recorded 1,00,000 cases in 2023 under Section 5 with detailed statistics and Supreme Court review.",
    "https://ncrb.gov.in/report-b",
    { sourceIndex: 2, sourceTitle: "NCRB B", sourceTier: "tier2" },
  );

  const unique = deduplicatePassagesSemantically([first, second]);

  assert.equal(unique.length, 1);
  assert.equal(unique[0].sourceIndex, 2);
});
