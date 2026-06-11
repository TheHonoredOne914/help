import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { getTopNForPrompt, rankEvidenceByTier } from "../../src/core/evidence/evidence-ranking.js";
import { getCachedRegistry, setCachedRegistry } from "../../src/lib/evidence-cache.js";
import { buildEvidenceRegistry, getCoreEvidenceRegistryBridge } from "../../src/lib/evidence-registry.js";
import type { EnrichedResult } from "../../src/lib/types.js";

test("exportForPrompt respects the 12000 character budget", () => {
  const contract = buildAgendaContract({ requestId: "prompt-budget", originalUserQuery: "Article 19 parliamentary accountability" });
  const registry = buildEvidenceRegistryFromSources(Array.from({ length: 40 }, (_, index) => ({
    title: `Official source ${index + 1}`,
    url: `https://pib.gov.in/source-${index + 1}`,
    sourceClass: "official_government",
    authorityScore: 94,
    fullText: `Official evidence ${index + 1} on ministry accountability and parliamentary question procedure. `.repeat(20),
    keyFacts: [
      `Official evidence ${index + 1} supports ministry accountability.`,
      `Parliamentary question procedure is relevant for source ${index + 1}.`,
      "This fact is intentionally long to exercise prompt budget handling without overflowing synthesis prompts.",
    ],
  })), contract);

  assert.ok(registry.exportForPrompt().length <= 12_000);
});

test("ranking separates strong, weak, and ineligible sources", () => {
  const registry = buildEvidenceRegistryFromSources([
    {
      title: "Supreme Court source",
      url: "https://www.sci.gov.in/judgment/source",
      sourceClass: "court_primary",
      authorityScore: 98,
      fullText: "The Supreme Court held an Article 19 legal holding.",
      keyFacts: ["The Supreme Court held an Article 19 legal holding."],
    },
    {
      title: "Snippet source",
      url: "https://example.org/snippet",
      authorityScore: 76,
      snippet: "A snippet mentions the agenda.",
    },
    {
      title: "Failed source",
      url: "https://example.org/failed",
      authorityScore: 90,
      extractionQuality: "failed",
    },
  ], buildAgendaContract({ requestId: "tiers", originalUserQuery: "Article 19" }));

  const tiers = rankEvidenceByTier(registry);
  assert.equal(tiers.strong.length, 1);
  assert.equal(tiers.weak.length, 1);
  assert.equal(tiers.ineligible.length, 1);
  assert.deepEqual(getTopNForPrompt(registry, 2).map((source) => source.citationStrength), ["strong", "weak"]);
});

test("evidence cache keys are separated by enrichment version", () => {
  const agenda = `cache version agenda ${Date.now()}`;
  const registry = buildEvidenceRegistry([legacyResult("https://example.org/a")], agenda);

  setCachedRegistry(agenda, "deep", registry, "run-a");

  assert.equal(getCachedRegistry(agenda, "deep", "run-b"), null);
  assert.equal(getCachedRegistry(agenda, "deep", "run-a")?.agendaText, agenda);
});

test("legacy registry attaches a core EvidenceRegistry bridge", () => {
  const registry = buildEvidenceRegistry([legacyResult("https://prsindia.org/billtrack/test")], "Article 356 parliament");
  const coreRegistry = getCoreEvidenceRegistryBridge(registry);

  assert.ok(coreRegistry);
  assert.equal(coreRegistry?.sources.length, 1);
  assert.equal(coreRegistry?.sources[0]?.topChunks.length, 0);
  assert.notEqual(coreRegistry?.sources[0]?.citationStrength, undefined);
});

function legacyResult(url: string): EnrichedResult {
  return {
    title: "Legacy source",
    url,
    snippet: "Legacy snippet about Indian parliamentary evidence.",
    engine: "test",
    score: 0.9,
    sourceType: "general",
    content: "Legacy full content about Indian parliamentary evidence and ministry accountability.".repeat(8),
  };
}
