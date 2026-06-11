import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import { buildDeterministicUsageItemFromSource, validateSourceUsageMap, type SourceUsageMapItem } from "../../src/core/evidence/source-usage-map.js";
import { runModelRoleForSourceUsage } from "../../src/core/synthesis/model-role-runner.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

function setup(count = 30) {
  const agendaContract = buildAgendaContract({ requestId: "source-usage-regression", originalUserQuery: "India civil liberties media freedom election accountability" });
  agendaContract.minimumEvidenceCardsPerModel = Math.min(count, 30);
  const bucketIds = agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId);
  const sources: EvidenceSource[] = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/${index + 1}`,
    canonicalUrl: `https://example.org/${index + 1}`,
    domain: "example.org",
    date: "2025-01-01",
    snippet: `Distinct claim ${index + 1} with ${index + 10}% evidence.`,
    fullText: `Distinct claim ${index + 1} with ${index + 10}% evidence for parliamentary debate.`,
    bucketIds: [bucketIds[index % bucketIds.length]],
    sourceClass: index === 0 ? "court_primary" : "policy_research",
    authorityScore: 8,
    extractionQuality: "full",
    keyFacts: [`Distinct claim ${index + 1}`],
    keyNumbers: [`${index + 10}%`],
    legalHoldings: index === 0 ? ["Court held a proportionality point."] : [],
    limitations: [`Limitation ${index + 1}`],
    citationEligible: true,
    confidence: "medium",
  }));
  const registry = buildEvidenceRegistryFromSources(sources, agendaContract);
  const cards = sources.map((source) => ({
    sourceId: source.id,
    title: source.title,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    keyFacts: source.keyFacts,
    keyNumbers: source.keyNumbers,
    legalHoldings: source.legalHoldings,
    limitations: source.limitations,
    debateUse: source.snippet ?? "",
  }));
  return { agendaContract, registry, cards };
}

function report(items: Partial<SourceUsageMapItem>[]) {
  const { agendaContract, registry } = setup();
  const sourceUsageMap = items.map((item) => ({
    title: registry.getSource(item.sourceId ?? 1)?.title ?? "Unknown",
    bucketIds: registry.getSource(item.sourceId ?? 1)?.bucketIds ?? [],
    sourceClass: registry.getSource(item.sourceId ?? 1)?.sourceClass ?? "policy_research",
    confidence: "medium" as const,
    usageType: "fact_extracted" as const,
    ...item,
  }));
  return validateSourceUsageMap({
    roleName: "test_role",
    requiredSourceCount: 30,
    receivedSourceIds: Array.from({ length: 30 }, (_, index) => index + 1),
    usedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    unusedSourceIds: [],
    sourceUsageMap,
    sourceUsageCount: sourceUsageMap.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, agendaContract, 30);
}

test("empty source usage map passes when no citation-eligible sources are available", () => {
  const agendaContract = buildAgendaContract({ requestId: "empty-source-gap", originalUserQuery: "India civil liberties research" });
  const registry = buildEvidenceRegistryFromSources([], agendaContract);

  const validation = validateSourceUsageMap({
    roleName: "agenda_architect",
    requiredSourceCount: 0,
    receivedSourceIds: [],
    usedSourceIds: [],
    unusedSourceIds: [],
    sourceUsageMap: [],
    sourceUsageCount: 0,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, agendaContract, 0);

  assert.equal(validation.passed, true);
  assert.deepEqual(validation.failures, []);
});

test("deterministic source usage does not treat a bare year as substantive numeric proof", () => {
  const { registry } = setup(1);
  const source = registry.getSource(1)!;
  source.keyFacts = ["The University Grants Commission listed Promotion of Equity regulations for higher education institutions."];
  source.keyNumbers = ["2026"];
  source.sourceClass = "official_government";

  const item = buildDeterministicUsageItemFromSource(source);

  assert.equal(item.usageType, "fact_extracted");
  assert.equal(item.extractedNumber, undefined);
  assert.match(item.extractedClaim ?? "", /University Grants Commission/);
});

test("listing-only, title-only, and missing conditional fields fail", () => {
  assert.equal(report(Array.from({ length: 30 }, (_, index) => ({ sourceId: index + 1, usageType: "relevant_but_weak" as const }))).passed, false);
  assert.equal(report(Array.from({ length: 30 }, (_, index) => ({ sourceId: index + 1, title: `Title ${index + 1}`, usageType: "fact_extracted" as const }))).passed, false);
  assert.equal(report([{ sourceId: 1, usageType: "fact_extracted" }]).passed, false);
  assert.equal(report([{ sourceId: 1, usageType: "number_extracted", extractedClaim: "claim" }]).passed, false);
  assert.equal(report([{ sourceId: 2, usageType: "legal_holding_extracted", legalHolding: "holding" }]).passed, false);
  assert.equal(report([{ sourceId: 1, usageType: "relevant_but_weak" }]).passed, false);
});

test("same generic claim repeated for 30 sources fails while 30 real usage items pass", () => {
  const repeated = report(Array.from({ length: 30 }, (_, index) => ({ sourceId: index + 1, usageType: "fact_extracted" as const, extractedClaim: "same generic claim" })));
  assert.equal(repeated.passed, false);
  assert.match(repeated.failures.join("\n"), /same generic claim/i);
  const real = report(Array.from({ length: 30 }, (_, index) => ({ sourceId: index + 1, usageType: "fact_extracted" as const, extractedClaim: `distinct extracted claim ${index + 1}` })));
  assert.equal(real.passed, true);
});

test("generic parliament topics do not require nine source buckets", () => {
  const agendaContract = buildAgendaContract({ requestId: "generic-three-buckets", originalUserQuery: "UGC regulations 2026", outputDepth: "deep_research" });
  const bucketIds = ["government_official", "indian_major_media", "court_legal"] as const;
  const sources = Array.from({ length: 30 }, (_, index) => ({
    title: `UGC source ${index + 1}`,
    url: `https://example.edu/ugc-${index + 1}`,
    canonicalUrl: `https://example.edu/ugc-${index + 1}`,
    domain: "example.edu",
    date: "2026-01-01",
    snippet: `Distinct UGC claim ${index + 1}`,
    fullText: `Distinct UGC claim ${index + 1} with policy detail.`,
    bucketIds: [bucketIds[index % bucketIds.length]],
    sourceClass: "policy_research" as const,
    authorityScore: 80,
    extractionQuality: "full" as const,
    keyFacts: [`Distinct UGC claim ${index + 1}`],
    keyNumbers: [],
    legalHoldings: [],
    limitations: [`Limitation ${index + 1}`],
    citationEligible: true,
    confidence: "medium" as const,
  }));
  const registry = buildEvidenceRegistryFromSources(sources, agendaContract);
  const sourceUsageMap = registry.getCitationEligibleSources().map((source) => ({
    sourceId: source.id,
    title: source.title,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    usageType: "fact_extracted" as const,
    extractedClaim: source.keyFacts[0],
    confidence: "medium" as const,
  }));

  const validation = validateSourceUsageMap({
    roleName: "agenda_architect",
    requiredSourceCount: 30,
    receivedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    usedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    unusedSourceIds: [],
    sourceUsageMap,
    sourceUsageCount: sourceUsageMap.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, agendaContract, 30);

  assert.equal(agendaContract.requiredSourceBuckets.length, 0);
  assert.equal(validation.passed, true);
});

test("invalid role output retries and repeated invalid output creates SourceUsageFailureReport", async () => {
  const { agendaContract, registry, cards } = setup();
  let calls = 0;
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => {
      calls += 1;
      return { provider: "gemini", model: "test", content: JSON.stringify({ sourceUsageMap: cards.slice(0, 5).map((card) => ({ sourceId: card.sourceId, usageType: "supports_claim", confidence: "medium" })) }) };
    },
  } as unknown as ProviderRouter;
  const output = await runModelRoleForSourceUsage({
    roleName: "evidence_extractor",
    evidenceCards: cards,
    evidenceRegistry: registry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
    minimumSourceRequirement: 30,
  });
  assert.ok(calls > 1);
  assert.equal(output.sourceUsageRequirementSatisfied, false);
  assert.ok(output.sourceUsageFailureReport);
});

test("no healthy provider returns provider configuration error", async () => {
  const { agendaContract, registry, cards } = setup();
  const providerRouter = { hasProvider: () => false } as unknown as ProviderRouter;
  const output = await runModelRoleForSourceUsage({
    roleName: "evidence_extractor",
    evidenceCards: cards,
    evidenceRegistry: registry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "groq",
    model: "test",
    minimumSourceRequirement: 30,
  });
  assert.equal(output.sourceUsageRequirementSatisfied, false);
  assert.equal(output.sourceUsageFailureReport?.recommendedAction, "configure_provider");
});
