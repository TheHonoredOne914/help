import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateCitations } from "../../src/core/verification/citation-validator.js";

function registryWithSources() {
  const contract = buildAgendaContract({
    originalUserQuery: "India Article 19 electoral integrity Parliament Supreme Court",
    outputDepth: "deep_research",
  });
  const registry = buildEvidenceRegistryFromSources([
    {
      title: "Supreme Court free speech judgment",
      url: "https://sci.gov.in/judgments/free-speech",
      snippet: "The Supreme Court discussed Article 19 speech limits.",
      sourceClass: "court_primary",
      bucketIds: ["court_legal"],
    },
    {
      title: "Election Commission safeguards",
      url: "https://eci.gov.in/vvpat/safeguards",
      snippet: "The Election Commission describes VVPAT safeguards.",
      sourceClass: "electoral_body",
      bucketIds: ["electoral_integrity", "government_official"],
    },
    {
      title: "Lok Sabha debate record",
      url: "https://sansad.in/ls/debates/example",
      snippet: "Lok Sabha members debated accountability and amendments.",
      sourceClass: "parliamentary_records",
      bucketIds: ["parliamentary_records"],
    },
  ] as any, contract);
  contract.minimumUniqueCitedSources = 2;
  contract.requiredSourceBuckets = [
    { bucketId: "court_legal", label: "Court", required: true },
    { bucketId: "electoral_integrity", label: "Election", required: true },
    { bucketId: "parliamentary_records", label: "Parliament", required: true },
  ] as any;
  return { contract, registry };
}

test("citation validator rejects non-existent Source IDs and URL mismatches", () => {
  const { contract, registry } = registryWithSources();

  const report = validateCitations(
    "Article 19 needs caution [Source 99](https://fake.example/source). ECI safeguards [Source 2](https://example.com/wrong).",
    registry,
    contract,
  );

  assert.equal(report.passed, false);
  assert.ok(report.rejectedCitations.some((item) => item.includes("Source 99")));
  assert.ok(report.rejectedCitations.some((item) => item.includes("Source 2")));
  assert.ok(report.invalidCitations.some((item) => /non-existent/i.test(item)));
  assert.ok(report.invalidCitations.some((item) => /URL mismatch/i.test(item)));
});

test("citation validator treats repeated citation spam as source-count inflation", () => {
  const { contract, registry } = registryWithSources();
  const spam = Array.from({ length: 12 }, () => registry.getCitationMarkdown(1)).join(" ");

  const report = validateCitations(`The same court source is repeated to inflate support. ${spam}`, registry, contract);

  assert.equal(report.passed, false);
  assert.equal(report.uniqueCitedSourceCount, 1);
  assert.ok(report.invalidCitations.some((item) => /repeated citation spam/i.test(item)));
});

test("citation validator reports missing bucket coverage when citation metadata exists", () => {
  const { contract, registry } = registryWithSources();

  const report = validateCitations(
    `Legal and election claims are cited ${registry.getCitationMarkdown(1)} ${registry.getCitationMarkdown(2)}`,
    registry,
    contract,
  );

  assert.equal(report.passed, false);
  assert.deepEqual(report.missingSourceBuckets, ["parliamentary_records"]);
});
