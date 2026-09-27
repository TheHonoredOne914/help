import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateLegalClaims } from "../../src/core/verification/legal-claim-validator.js";

test("legal validator does not treat withheld as legal language", () => {
  const contract = buildAgendaContract({ originalUserQuery: "NFHS obesity prevalence India" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "NFHS-6 obesity briefing",
    url: "https://example.org/nfhs6",
    snippet: "Adult overweight prevalence rose in NFHS-6.",
    sourceClass: "policy_research",
    bucketIds: ["policy_research"],
  } as any], contract);

  const withheldOnly = validateLegalClaims(
    "Source Gap Disclosure: raw unsupported fragments are withheld from the answer to avoid promoting unverified claims.",
    registry,
  );
  assert.equal(withheldOnly.passed, true);
  assert.equal(withheldOnly.criticalIssues.length, 0);

  const inventedHolding = validateLegalClaims(
    "The Supreme Court held that obesity policy is a constitutional duty.",
    registry,
  );
  assert.equal(inventedHolding.passed, false);
  assert.ok(inventedHolding.criticalIssues.some((issue) => /Legal claim requires court/i.test(issue)));
});

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
  // Off-allowlist articles warn (not fatal): live smokes kept dying on real missing numbers (282, …).
  const unknown = validateLegalClaims("Article 99 creates a speech right.", registry);
  assert.equal(unknown.criticalIssues.length, 0);
  assert.ok(unknown.warnings.some((issue) => /Unknown constitutional Article 99/i.test(issue)));
  assert.equal(validateLegalClaims("Article 105 privileges and Article 249 national-interest legislation under Article 324 ECI oversight.", registry).passed, true);
  assert.equal(validateLegalClaims("Article 282 Union grants to States.", registry).criticalIssues.length, 0);
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
  assert.equal(fakeArticle.criticalIssues.length, 0);
  assert.ok(fakeArticle.warnings.some((issue) => /Unknown constitutional Article 99/i.test(issue)));
});

test("generic legal vocabulary with court registry sources is warning-only without ClaimLedger holdings", () => {
  const contract = buildAgendaContract({ originalUserQuery: "Election Commission deepfakes Supreme Court regulation" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Supreme Court of India docket",
    url: "https://sci.gov.in",
    snippet: "IT and election-related matters listed on the docket.",
    sourceClass: "court_primary",
    bucketIds: ["court_legal"],
  } as any], contract);

  const generic = validateLegalClaims(
    "Regulation must survive constitutional doctrine and case law scrutiny in the judgment pathway.",
    registry,
  );
  assert.equal(generic.criticalIssues.length, 0, "must not fatal-fail when court sources exist but ClaimLedger lacks typed holdings");
  assert.ok(generic.warnings.some((issue) => /no verified Article, case, or ClaimLedger holding/i.test(issue)));

  const noCourt = validateLegalClaims(
    "The Supreme Court held that platform transparency is a statutory requirement.",
    buildEvidenceRegistryFromSources([{
      title: "Media note",
      url: "https://example.org/media",
      snippet: "Platforms face pressure on deepfakes.",
      sourceClass: "indian_major_media",
      bucketIds: ["indian_major_media"],
    } as any], contract),
  );
  assert.ok(noCourt.criticalIssues.some((issue) => /Legal claim requires court|no verified Article/i.test(issue)));
});
