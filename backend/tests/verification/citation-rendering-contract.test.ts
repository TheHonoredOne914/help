import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateCitations } from "../../src/core/verification/citation-validator.js";

const contract = buildAgendaContract({
  originalUserQuery: "India UAPA FCRA parliamentary accountability",
  outputDepth: "detailed",
});
const registry = buildEvidenceRegistryFromSources([
  {
    title: "PIB official note",
    url: "https://pib.gov.in/example",
    fullText: "India government parliamentary accountability evidence.",
    snippet: "India government parliamentary accountability evidence.",
    sourceClass: "official_government",
    citationEligible: true,
  },
], contract);

test("linked Source citation maps to EvidenceRegistry source id", () => {
  const report = validateCitations("Claim [Source 1](https://pib.gov.in/example)", registry, contract);

  assert.equal(report.rejectedCitations.length, 0);
  assert.deepEqual(report.sourceIdsActuallyUsed, [1]);
});

test("fake citation id fails validation", () => {
  const report = validateCitations("Claim [Source 99](https://pib.gov.in/example)", registry, contract);

  assert.match(report.rejectedCitations.join("\n"), /Source 99/);
  assert.equal(report.sourceIdsActuallyUsed.length, 0);
});

test("bare citation spam is rejected for repair instead of accepted as final", () => {
  const report = validateCitations("Dumped citations [1] [2] [3] [4] [5]", registry, contract);

  assert.ok(report.rejectedCitations.length >= 5);
  assert.equal(report.passed, false);
});

test("citation markdown escapes URL parentheses but validates against registry URL", () => {
  const parenRegistry = buildEvidenceRegistryFromSources([
    {
      title: "University Grants Commission (India)",
      url: "https://example.org/wiki/University_Grants_Commission_(India)",
      fullText: "University Grants Commission India source text.",
      snippet: "University Grants Commission India source text.",
      sourceClass: "policy_research",
      citationEligible: true,
    },
  ], contract);
  const citation = parenRegistry.getCitationMarkdown(1);
  const report = validateCitations(`Claim ${citation}`, parenRegistry, contract);

  assert.match(citation, /%28India%29/);
  assert.equal(report.rejectedCitations.length, 0);
  assert.deepEqual(report.sourceIdsActuallyUsed, [1]);
});
