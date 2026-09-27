import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateCitations } from "../../src/core/verification/citation-validator.js";

function makeRegistry() {
  const contract = buildAgendaContract({ originalUserQuery: "India parliamentary obesity policy NFHS" });
  const registry = buildEvidenceRegistryFromSources([
    {
      title: "NFHS-5 Obesity Report",
      url: "https://mohfw.gov.in/nfhs5-obesity",
      canonicalUrl: "https://mohfw.gov.in/nfhs5-obesity",
      domain: "mohfw.gov.in",
      bucketIds: ["official_government"],
      sourceClass: "official_government",
      authorityScore: 85,
      snippet: "NFHS-5 found that 24 percent of women and 23 percent of men in India are overweight or obese.",
      fullText: "NFHS-5 found that 24 percent of women and 23 percent of men in India are overweight or obese. The survey documents rising non-communicable disease burden.",
      extractionQuality: "full",
      keyFacts: ["NFHS-5 found that 24 percent of women and 23 percent of men in India are overweight or obese."],
      citationEligible: true,
    },
  ], contract);
  return { contract, registry };
}

test("paraphrased claim grounded in source passes citation validation", () => {
  const { contract, registry } = makeRegistry();
  const source = registry.getSource(1)!;
  const text = `The NFHS-5 survey found that 24 percent of women and 23 percent of men in India are overweight or obese. [Source 1](${source.url})`;
  const report = validateCitations(text, registry, contract, { mode: "deep_research" });
  assert.equal(report.passed, true);
  assert.equal(report.unsupportedCitationWarnings.length, 0);
  assert.equal(report.invalidCitations.filter((issue) => /does not support claim/i.test(issue)).length, 0);
});

test("fabricated claim attached to real citation fails in deep_research", () => {
  const { contract, registry } = makeRegistry();
  const source = registry.getSource(1)!;
  const text = `Parliament banned all sugar imports and criminalized soft drinks nationwide in 2024. [Source 1](${source.url})`;
  const report = validateCitations(text, registry, contract, { mode: "deep_research" });
  assert.equal(report.passed, false);
  assert.ok(report.invalidCitations.some((issue) => /does not support claim/i.test(issue)));
});

test("fabricated claim is warning-only in fast_research", () => {
  const { contract, registry } = makeRegistry();
  const source = registry.getSource(1)!;
  const text = `Parliament banned all sugar imports and criminalized soft drinks nationwide in 2024. [Source 1](${source.url})`;
  const report = validateCitations(text, registry, contract, { mode: "fast_research" });
  assert.equal(report.unsupportedCitationWarnings.length, 1);
  assert.equal(report.invalidCitations.filter((issue) => /does not support claim/i.test(issue)).length, 0);
});

test("Registry Evidence Landscape cites are skipped for grounding and spam tallies", () => {
  const { contract, registry } = makeRegistry();
  const source = registry.getSource(1)!;
  const url = source.url;
  const text = [
    `The NFHS-5 survey found that 24 percent of women and 23 percent of men in India are overweight or obese. [Source 1](${url})`,
    "",
    "## Registry Evidence Landscape",
    "Multi-bucket registry coverage:",
    "",
    "| Bucket | Sources |",
    "|--------|---------|",
    `| official_government | [Source 1](${url}) [Source 1](${url}) [Source 1](${url}) |`,
    "",
    "## Citation Ledger",
    `- [Source 1](${url})`,
  ].join("\n");
  const report = validateCitations(text, registry, contract, { mode: "fast_research" });
  assert.equal(report.unsupportedCitationWarnings.length, 0);
  assert.equal(report.repeatedCitationWarnings.length, 0);
  assert.ok(report.sourceIdsActuallyUsed.includes(1));
});

test("Citation Ledger and Evidence Landscape do not raise the unique cited count", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India parliamentary obesity policy NFHS" });
  const registry = buildEvidenceRegistryFromSources([
    {
      title: "NFHS-5 Obesity Report",
      url: "https://mohfw.gov.in/nfhs5-obesity",
      canonicalUrl: "https://mohfw.gov.in/nfhs5-obesity",
      domain: "mohfw.gov.in",
      bucketIds: ["official_government"],
      sourceClass: "official_government",
      authorityScore: 85,
      snippet: "NFHS-5 found that 24 percent of women and 23 percent of men in India are overweight or obese.",
      fullText: "NFHS-5 found that 24 percent of women and 23 percent of men in India are overweight or obese. The survey documents rising non-communicable disease burden.",
      extractionQuality: "full",
      keyFacts: ["NFHS-5 found that 24 percent of women and 23 percent of men in India are overweight or obese."],
      citationEligible: true,
    },
    {
      title: "PIB note on labelling",
      url: "https://pib.gov.in/press-release-labelling",
      canonicalUrl: "https://pib.gov.in/press-release-labelling",
      domain: "pib.gov.in",
      bucketIds: ["official_government"],
      sourceClass: "official_government",
      authorityScore: 80,
      snippet: "The Commission directed parties to label synthetic campaign content.",
      fullText: "The Commission directed parties to label synthetic campaign content in the interest of transparency.",
      extractionQuality: "full",
      keyFacts: ["The Commission directed parties to label synthetic campaign content."],
      citationEligible: true,
    },
  ], contract);
  const prose = registry.getSource(1)!;
  const indexed = registry.getSource(2)!;
  const text = [
    `The NFHS-5 survey found that 24 percent of women and 23 percent of men in India are overweight or obese. [Source 1](${prose.url})`,
    "",
    "## Registry Evidence Landscape",
    `| official_government | [Source 2](${indexed.url}) |`,
    "",
    "## Citation Ledger",
    `[Source 2](${indexed.url})`,
  ].join("\n");
  const report = validateCitations(text, registry, contract, { mode: "fast_research" });
  assert.deepEqual(report.sourceIdsActuallyUsed, [1]);
  assert.equal(report.uniqueCitedSourceCount, 1);
});

test("model-renamed Evidence Landscape section cites are skipped for grounding", () => {
  const { contract, registry } = makeRegistry();
  const source = registry.getSource(1)!;
  const url = source.url;
  const text = [
    "## 1. Evidence Landscape (what we have)",
    "",
    "| Bucket | Source | Core Point(s) |",
    "|--------|--------|---------------|",
    `| official_government | [Source 1](${url}) | Completely fabricated landscape blurb about banning sugar imports nationwide in 2024 that is not in the source. [Source 1](${url}) |`,
    "",
    "## 2. Treasury Bench",
    `Parliament banned all sugar imports and criminalized soft drinks nationwide in 2024. [Source 1](${url})`,
  ].join("\n");
  const report = validateCitations(text, registry, contract, { mode: "fast_research" });
  // Landscape cite-map row skipped; only the body claim warns.
  assert.equal(report.unsupportedCitationWarnings.length, 1);
  assert.match(report.unsupportedCitationWarnings[0]!, /banned all sugar imports/i);
});

test("Citation Ledger link dump is skipped for grounding warnings", () => {
  const { contract, registry } = makeRegistry();
  const source = registry.getSource(1)!;
  const url = source.url;
  const text = [
    `The NFHS-5 survey found that 24 percent of women and 23 percent of men in India are overweight or obese. [Source 1](${url})`,
    "",
    "## Citation Ledger",
    `[Source 1](${url}) [Source 1](${url}) Completely fabricated ledger fluff about banning sugar imports nationwide in 2024 that is not in the source. [Source 1](${url})`,
    "",
    "## Debate Utility",
    "No citations here.",
  ].join("\n");
  const report = validateCitations(text, registry, contract, { mode: "fast_research" });
  assert.equal(report.unsupportedCitationWarnings.length, 0);
  assert.ok(report.sourceIdsActuallyUsed.includes(1));
});

test("Debate Utility Arsenal and Additional Source-Backed Bullets cites are skipped for grounding", () => {
  const { contract, registry } = makeRegistry();
  const source = registry.getSource(1)!;
  const url = source.url;
  const text = [
    `The NFHS-5 survey found that 24 percent of women and 23 percent of men in India are overweight or obese. [Source 1](${url})`,
    "",
    "## Additional Source-Backed Bullets",
    `- Fabricated bullet about banning sugar imports nationwide in 2024. [Source 1](${url})`,
    "",
    "## Indian Mock Parliament Debate Utility Arsenal",
    `Treasury Bench: invent a claim that Parliament banned soft drinks in 2024. [Source 1](${url})`,
    "",
    "## Citation Ledger",
    `- [Source 1](${url})`,
  ].join("\n");
  const report = validateCitations(text, registry, contract, { mode: "fast_research" });
  assert.equal(report.unsupportedCitationWarnings.length, 0);
  assert.ok(report.sourceIdsActuallyUsed.includes(1));
});
