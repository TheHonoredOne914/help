import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacks, buildModelEvidencePack } from "../../../src/core/evidence/evidence-pack-builder.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-01/B14-08 roles receive genuinely different citation-safe evidence pools", () => {
  const contract = testContract("AIPPM Article 19 electoral bonds Supreme Court Election Commission 2025");
  const registry = registryWith([
    testSource({
      title: "Supreme Court electoral bonds judgment",
      url: "https://www.sci.gov.in/source-1",
      bucketIds: ["court_legal"],
      sourceClass: "court_primary",
      authorityScore: 98,
      legalHoldings: ["The Court held voter information is linked to Article 19."],
      citationStrength: "strong",
    }),
    testSource({
      title: "Sansad parliamentary question on Supreme Court bonds",
      url: "https://sansad.in/source-2",
      bucketIds: ["parliamentary_records"],
      sourceClass: "parliamentary_records",
      authorityScore: 94,
      citationStrength: "strong",
    }),
    testSource({
      title: "Election Commission statistical note",
      url: "https://eci.gov.in/source-3",
      bucketIds: ["electoral_integrity", "government_official"],
      sourceClass: "electoral_body",
      authorityScore: 95,
      keyNumbers: ["2024", "47.5%"],
      citationStrength: "strong",
    }),
    testSource({
      title: "Policy research explainer",
      url: "https://prsindia.org/source-4",
      bucketIds: ["policy_research"],
      sourceClass: "policy_research",
      authorityScore: 82,
      citationStrength: "medium",
    }),
    testSource({
      title: "Weak social-media allegation",
      url: "https://x.com/source-5",
      bucketIds: [],
      sourceClass: "social_media",
      authorityScore: 15,
      extractionQuality: "snippet",
      citationEligible: true,
      limitedSource: true,
      citationStrength: "weak",
      limitations: ["Only weak allegation context."],
    }),
  ], contract);

  const packs = buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "deep_research" });
  const citationAuditor = buildModelEvidencePack("citation_auditor", packs, contract, { query: contract.normalizedAgenda, mode: "deep_research" });
  const legalStrategist = buildModelEvidencePack("legal_strategist", packs, contract, { query: contract.normalizedAgenda, mode: "deep_research" });
  const evidenceExtractor = buildModelEvidencePack("evidence_extractor", packs, contract, { query: contract.normalizedAgenda, mode: "deep_research" });
  const retrievalCritic = buildModelEvidencePack("retrieval_critic", packs, contract, { query: contract.normalizedAgenda, mode: "deep_research" });

  console.log('auditor', citationAuditor.cards.map((card) => card.sourceId));
  console.log('legal', legalStrategist.cards.map((card) => card.sourceId));
  assert.notDeepEqual(evidenceExtractor.cards.map((card) => card.sourceId), legalStrategist.cards.map((card) => card.sourceId));
  assert.ok(citationAuditor.cards.slice(0, 3).every((card) => card.citationStrength === "strong" || card.citationStrength === "medium"));
  assert.ok(legalStrategist.cards.slice(0, 3).some((card) => card.bucketIds.includes("court_legal") || card.bucketIds.includes("parliamentary_records")));
  assert.ok(evidenceExtractor.cards.slice(0, 4).some((card) => card.keyNumbers.length > 0));
  assert.ok(retrievalCritic.cards.some((card) => card.limitedSource || card.citationStrength === "weak"));
});

test("B14-01 unknown role uses safe default with warning instead of role zero rotation", () => {
  const contract = testContract();
  const registry = registryWith([1, 2, 3, 4].map((id) => testSource({ url: `https://example${id}.org/source-${id}` })), contract);
  const packs = buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "fast_research" });
  const unknown = buildModelEvidencePack("custom_role_from_future", packs, contract, { query: contract.normalizedAgenda, mode: "fast_research" });

  assert.ok(unknown.limitations.some((limitation) => /unknown role/i.test(limitation)));
  assert.equal(unknown.cards.length > 0, true);
});
