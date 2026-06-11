import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEvidenceBlockForDivision, buildEvidenceRegistry } from "../src/lib/evidence-registry.ts";
import { enrichResults } from "../src/lib/rag.ts";
import type { Division } from "../src/lib/division-framework.ts";
import type { EnrichedResult } from "../src/lib/types.ts";

function result(overrides: Partial<EnrichedResult>): EnrichedResult {
  return {
    title: "Source",
    url: "https://example.com/source",
    snippet: "Short snippet",
    engine: "serper",
    score: 0.9,
    sourceType: "general",
    content: "Full source content ".repeat(50),
    ...overrides,
  };
}

test("court judgement sources receive tier one classification", () => {
  const registry = buildEvidenceRegistry([
    result({
      title: "Maneka Gandhi v Union of India",
      url: "https://indiankanoon.org/doc/1766147/",
      sourceType: "court_judgement",
      judgement: {
        isJudgement: true,
        caseName: "Maneka Gandhi v. Union of India",
        caseNumber: "WP 231 of 1977",
        year: "1978",
        court: "Supreme Court of India",
        bench: "",
        held: "Article 21 procedure must be fair, just and reasonable.",
        relevance: "",
        url: "https://indiankanoon.org/doc/1766147/",
      },
    }),
  ], "Article 21 privacy");

  assert.equal(registry.sources[0].tier, "tier1");
  assert.equal(registry.courtJudgements.length, 1);
});

test("CAG sources receive tier two classification", () => {
  const registry = buildEvidenceRegistry([
    result({ title: "CAG audit", url: "https://cag.gov.in/report", sourceType: "government_india" }),
  ], "scheme audit");

  assert.equal(registry.sources[0].tier, "tier2");
  assert.equal(registry.tier2Sources.length, 1);
});

test("snippet-only sources are flagged and warned in evidence block", () => {
  const registry = buildEvidenceRegistry([
    result({ content: "", snippet: "Only a small snippet is available." }),
  ], "press freedom India");
  const division: Division = {
    id: "test",
    name: "Test",
    number: 1,
    alwaysPresent: true,
    minWordsForPrimary: 100,
    minWordsForSecondary: 50,
    evidenceTiers: ["untiered" as any],
    generateInstructions: () => "",
  };

  assert.equal(registry.snippetOnlySources.length, 1);
  assert.match(buildEvidenceBlockForDivision(division, registry), /SNIPPET ONLY/);
});

test("evidence gaps are detected when legal agenda lacks court judgements", () => {
  const registry = buildEvidenceRegistry([
    result({ title: "General article", url: "https://example.com/article", sourceType: "general" }),
  ], "constitutional Article 21 legal challenge");

  assert.ok(registry.evidenceGaps.some((gap) => gap.includes("No court judgement")));
});

test("evidence block surfaces court judgements with structured case format", () => {
  const registry = buildEvidenceRegistry([
    result({
      sourceType: "court_judgement",
      judgement: {
        isJudgement: true,
        caseName: "Kesavananda Bharati v. State of Kerala",
        caseNumber: "",
        year: "1973",
        court: "Supreme Court of India",
        bench: "",
        held: "Basic structure doctrine limits constitutional amendment power.",
        relevance: "",
        url: "https://indiankanoon.org/doc/257876/",
      },
    }),
  ], "basic structure");
  const division: Division = {
    id: "test",
    name: "Test",
    number: 1,
    alwaysPresent: true,
    minWordsForPrimary: 100,
    minWordsForSecondary: 50,
    evidenceTiers: ["tier1"],
    generateInstructions: () => "",
  };

  assert.match(buildEvidenceBlockForDivision(division, registry), /Kesavananda Bharati v\. State of Kerala/);
  assert.match(buildEvidenceBlockForDivision(division, registry), /\[Source 1\]/);
});

test("prsindia.org URL is classified as tier two only", () => {
  const registry = buildEvidenceRegistry([
    result({ title: "PRS Legislative Brief", url: "https://prsindia.org/billtrack/example" }),
  ], "parliament legislation");

  assert.equal(registry.sources[0].tier, "tier2");
  assert.equal(registry.tier2Sources.length, 1);
  assert.equal(registry.tier4Sources.length, 0);
});

test("enrichResults deep mode fetches twelve sources instead of six", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    return new Response("<html><body><article><p>India parliamentary evidence 2026 source content with enough text for readability extraction and scoring.</p></article></body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }) as typeof fetch;

  try {
    const results = Array.from({ length: 14 }, (_, index) => ({
      title: `Source ${index + 1}`,
      url: `https://example.com/source-${index + 1}`,
      snippet: "India parliamentary evidence 2026",
      engine: "test",
      score: 1,
      sourceType: "general" as const,
    }));

    await enrichResults(results, "India parliamentary evidence", 6, undefined, null, "deep");

    assert.equal(fetchedUrls.length, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
