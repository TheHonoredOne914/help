import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBudgetedEvidencePack,
  compressSourceToEvidenceCard,
  dedupeNearDuplicateSnippets,
  rankParagraphsByRelevance,
} from "../../src/core/evidence/evidence-compressor.js";
import type { EvidenceSource } from "../../src/core/evidence/evidence-registry.js";

function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    id: 1,
    title: "Supreme Court electoral bonds judgment",
    url: "https://www.sci.gov.in/judgment/electoral-bonds",
    canonicalUrl: "https://www.sci.gov.in/judgment/electoral-bonds",
    domain: "sci.gov.in",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    authorityScore: 98,
    date: "2024-02-15",
    fullText: [
      "The Supreme Court held that transparency in political funding is linked to Article 19 and voter information.",
      "The judgment discusses proportionality, disclosure, and constitutional accountability in electoral finance.",
      "This paragraph is generic site navigation with no useful claim.",
      "The Union government defended the scheme on donor privacy and banking-channel grounds.",
    ].join("\n\n"),
    snippet: "Supreme Court electoral bonds judgment on political funding transparency.",
    extractionQuality: "full",
    discoveredBy: ["serper"],
    extractedBy: "jina",
    keyFacts: [
      "The Supreme Court connected voter information to Article 19 in the electoral bonds judgment.",
      "The Union government defended donor privacy and banking-channel use.",
      "The judgment creates a rights-based challenge for Opposition floor strategy.",
      "The issue can be framed through Election Commission disclosure obligations.",
      "Extra fact that should be clipped by the card budget.",
    ],
    keyNumbers: [],
    legalHoldings: ["The Court treated political funding transparency as constitutionally relevant to voter information."],
    namedEntities: ["Supreme Court of India", "Union government"],
    limitations: ["Judgment-specific source; do not use for broad polling statistics."],
    confidence: "high",
    citationEligible: true,
    topChunks: [{ text: "The Supreme Court held that transparency in political funding is linked to Article 19 and voter information.", score: 9, chunkIndex: 0 }],
    limitedSource: false,
    citationStrength: "strong",
    ...overrides,
  };
}

test("compressSourceToEvidenceCard preserves stable source identity and clips atomic evidence", () => {
  const card = compressSourceToEvidenceCard(source(), "AIPPM electoral bonds Supreme Court voter information", {
    maxCardChars: 900,
    maxClaims: 3,
    maxSnippets: 2,
  });

  assert.equal(card.sourceId, 1);
  assert.equal(card.title, "Supreme Court electoral bonds judgment");
  assert.equal(card.url, "https://www.sci.gov.in/judgment/electoral-bonds");
  assert.deepEqual(card.bucketIds, ["court_legal"]);
  assert.equal(card.discoveredBy?.[0], "serper");
  assert.equal(card.extractionProvider, "jina");
  assert.equal(card.reliabilityScore, 98);
  assert.equal(card.citationEligible, true);
  assert.equal(card.citationStrength, "strong");
  assert.equal(card.limitedSource, false);
  assert.equal(card.topChunks.length, 1);
  assert.ok(card.atomicClaims.length <= 3);
  assert.ok(card.snippets.length <= 2);
  assert.ok(card.relevanceReason.length > 0);
  assert.ok(card.charLength <= 900);
});

test("rankParagraphsByRelevance prefers query-bearing paragraphs", () => {
  const ranked = rankParagraphsByRelevance([
    "Navigation, contact, archive, sitemap.",
    "Election Commission disclosure and Supreme Court doctrine shaped the electoral bonds debate.",
    "Generic India parliamentary issue sentence.",
  ], new Set(["election", "commission", "supreme", "court", "electoral", "bonds"]));

  assert.match(ranked[0].text, /Election Commission disclosure/);
  assert.ok(ranked[0].score > ranked.at(-1)!.score);
});

test("dedupeNearDuplicateSnippets removes near-copy snippets without dropping distinct claims", () => {
  const deduped = dedupeNearDuplicateSnippets([
    "The Supreme Court linked political funding transparency to voter information.",
    "Supreme Court linked political funding transparency with voter information.",
    "The Union government defended donor privacy and banking channels.",
  ]);

  assert.equal(deduped.length, 2);
  assert.ok(deduped.some((snippet) => /Union government/.test(snippet)));
});

test("buildBudgetedEvidencePack respects pack budget and prioritizes citation-eligible official sources", () => {
  const lowQuality = source({
    id: 2,
    title: "Social media commentary",
    url: "https://x.com/example/status/1",
    canonicalUrl: "https://x.com/example/status/1",
    domain: "x.com",
    bucketIds: [],
    sourceClass: "social_media",
    authorityScore: 15,
    citationEligible: false,
    keyFacts: ["A social post repeats the topic without verifiable evidence."],
  });
  const official = source({
    id: 3,
    title: "Election Commission official disclosure note",
    url: "https://eci.gov.in/disclosure-note",
    canonicalUrl: "https://eci.gov.in/disclosure-note",
    domain: "eci.gov.in",
    bucketIds: ["electoral_integrity", "government_official"],
    sourceClass: "electoral_body",
    authorityScore: 95,
  });

  const pack = buildBudgetedEvidencePack([lowQuality, source(), official], "electoral bonds Election Commission Supreme Court", {
    mode: "fast_research",
    maxCards: 2,
    maxPackChars: 1600,
    maxCardChars: 800,
  });

  console.log(pack.droppedReason);
  assert.deepEqual(pack.cards.map((card) => card.sourceId), [1, 3]);
  assert.equal(pack.droppedSourceIds.includes(2), true);
  assert.equal(pack.compressionApplied, true);
  assert.ok(pack.text.length <= 1600);
});

test("buildBudgetedEvidencePack degrades huge must-include sources instead of throwing", () => {
  const hugeJudgment = source({
    id: 9,
    title: "Huge Supreme Court judgment",
    url: "https://www.sci.gov.in/judgment/huge",
    canonicalUrl: "https://www.sci.gov.in/judgment/huge",
    fullText: "Supreme Court proportionality holding. ".repeat(500),
    keyFacts: [
      "The Supreme Court proportionality holding is central to the constitutional challenge.",
      "The judgment must be cited even when the prompt budget is tight.",
    ],
    legalHoldings: ["The Court applied proportionality to state action."],
  });

  assert.doesNotThrow(() => buildBudgetedEvidencePack([source(), hugeJudgment], "Supreme Court proportionality", {
    mode: "fast_research",
    maxCards: 2,
    maxPackChars: 700,
    maxCardChars: 500,
    maxClaims: 2,
    maxSnippets: 1,
    mustIncludeSourceIds: [9],
  }));
  const pack = buildBudgetedEvidencePack([source(), hugeJudgment], "Supreme Court proportionality", {
    mode: "fast_research",
    maxCards: 2,
    maxPackChars: 700,
    maxCardChars: 500,
    maxClaims: 2,
    maxSnippets: 1,
    mustIncludeSourceIds: [9],
  });

  assert.ok(pack.cards.some((card) => card.sourceId === 9));
  assert.ok(pack.text.includes("[Source 9]"));
  assert.ok(pack.text.length <= 700);
});
