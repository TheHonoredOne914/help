import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateLegalClaims } from "../../src/core/verification/legal-claim-validator.js";

test("legal validator allows known articles and flags fake articles", () => {
  const contract = buildAgendaContract({ originalUserQuery: "Article 19 freedom of speech Shreya Singhal" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Shreya Singhal v Union of India",
    url: "https://indiankanoon.org/doc/110813550/",
    snippet: "Shreya Singhal v Union of India Article 19 speech judgment",
    sourceClass: "legal_commentary",
    bucketIds: ["court_legal"],
  } as any], contract);

  assert.equal(validateLegalClaims("Article 19(1)(a) was discussed in Shreya Singhal v Union of India.", registry).passed, true);
  assert.equal(validateLegalClaims("Article 99 creates a speech right.", registry).passed, false);
});

test("legal validator allows registry-derived cases and distinguishes warnings from critical legal defects", () => {
  const contract = buildAgendaContract({ originalUserQuery: "Article 21 privacy Puttaswamy Supreme Court" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Justice K.S. Puttaswamy v Union of India",
    url: "https://sci.gov.in/privacy",
    snippet: "Justice K.S. Puttaswamy v Union of India held privacy is protected under Article 21.",
    sourceClass: "court_primary",
    bucketIds: ["court_legal"],
    legalHoldings: ["Justice K.S. Puttaswamy v Union of India held privacy is protected under Article 21."],
  } as any], contract);

  const registryCase = validateLegalClaims("Article 21 was central in Justice K.S. Puttaswamy v Union of India.", registry);
  assert.equal(registryCase.passed, true);
  assert.equal(registryCase.criticalIssues.length, 0);

  const unknownCase = validateLegalClaims("Example Rao v Union of India changed the doctrine.", registry);
  assert.equal(unknownCase.passed, false);
  assert.equal(unknownCase.criticalIssues.length, 0);
  assert.ok(unknownCase.warnings.some((issue) => /Unrecognized case/i.test(issue)));

  const fakeArticle = validateLegalClaims("Article 99 creates a new press freedom right.", registry);
  assert.equal(fakeArticle.passed, false);
  assert.ok(fakeArticle.criticalIssues.some((issue) => /Unknown constitutional Article 99/i.test(issue)));
});
