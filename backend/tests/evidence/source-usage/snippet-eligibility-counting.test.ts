import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../../src/core/evidence/evidence-registry.js";
import { getSourceUsagePolicy } from "../../../src/core/config/source-usage-policy.js";
import { aggregateSourceUsageResults } from "../../../src/core/pipeline/research-pipeline.js";
import { buildDeterministicRoleUsageItems } from "../../../src/core/synthesis/role-generation/deterministic-role-runner.js";
import type { EvidenceCard } from "../../../src/core/evidence/evidence-pack-builder.js";
import type { ModelRoleOutput } from "../../../src/core/evidence/source-usage-map.js";

function snippetSources(count: number): EvidenceSource[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const snippet = `The Election Commission and platforms must label paid political advertising and deepfakes during elections in India for source ${id} with clear provenance and takedown timelines.`;
    return {
      id,
      title: `Eligible snippet source ${id}`,
      url: `https://www.thehindu.com/news/source-${id}`,
      canonicalUrl: `https://www.thehindu.com/news/source-${id}`,
      domain: "thehindu.com",
      bucketIds: ["indian_major_media"],
      sourceClass: "indian_major_media",
      authorityScore: 70,
      date: "2026-05-22",
      fullText: null,
      snippet,
      extractionQuality: "snippet",
      keyFacts: [snippet],
      keyNumbers: [],
      legalHoldings: [],
      namedEntities: ["Election Commission"],
      limitations: ["Snippet-only extraction; qualify carefully."],
      confidence: "low",
      citationEligible: true,
      citationStrength: "weak",
      limitedSource: true,
      topChunks: [{ text: snippet, score: 8, chunkIndex: 0, sourceId: id }],
    };
  });
}

function cardsFromSources(sources: EvidenceSource[]): EvidenceCard[] {
  return sources.map((source) => ({
    sourceId: source.id,
    citation: `[Source ${source.id}](${source.url})`,
    title: source.title,
    url: source.url,
    sourceClass: source.sourceClass,
    bucketIds: source.bucketIds,
    date: source.date,
    relevanceScore: source.authorityScore,
    queryRelevanceScore: source.authorityScore,
    rankScore: source.authorityScore,
    roleRelevanceScore: source.authorityScore,
    keyFacts: source.keyFacts,
    keyNumbers: source.keyNumbers,
    legalHoldings: source.legalHoldings,
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: source.snippet ?? source.keyFacts[0] ?? "",
    limitations: source.limitations,
    usableSections: ["evidence_verification"],
    contentPreview: source.snippet ?? source.keyFacts[0] ?? "",
    citationStrength: source.citationStrength,
    topChunks: source.topChunks,
    limitedSource: source.limitedSource,
    extractionQuality: source.extractionQuality,
    enrichmentCard: undefined,
    evidenceItems: [],
    namedEntities: source.namedEntities,
  }));
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length <= 1) return items;
  const normalized = offset % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

test("deterministic recovery across rotated roles counts substantive citation-eligible snippets to the fast floor", () => {
  const sources = snippetSources(44);
  const contract = buildAgendaContract({
    requestId: "snippet-union",
    originalUserQuery: "AIPPM debate on Election Commission regulation of deepfakes and online political ads",
  });
  contract.minimumEvidenceCardsPerModel = 10;
  contract.minimumUniqueCitedSources = 40;
  const registry = buildEvidenceRegistryFromSources(sources, contract);
  const cards = cardsFromSources(sources);
  const roles = ["retrieval_critic", "evidence_extractor", "thesis_synthesizer", "citation_auditor"];
  const outputs: ModelRoleOutput[] = roles.map((roleName, roleIndex) => {
    const roleCards = rotate(cards, roleIndex * 10);
    const items = buildDeterministicRoleUsageItems(roleCards, 10, roleName);
    const usedSourceIds = items
      .filter((item) => item.usageType !== "relevant_but_weak")
      .map((item) => item.sourceId);
    return {
      roleName,
      minimumSourceRequirement: 10,
      requiredSourceCount: 10,
      receivedSourceIds: roleCards.map((card) => card.sourceId),
      usedSourceIds,
      unusedSourceIds: roleCards.map((card) => card.sourceId).filter((id) => !usedSourceIds.includes(id)),
      sourceUsageMap: items,
      sourceCountUsed: usedSourceIds.length,
      sourceRequirementSatisfied: usedSourceIds.length >= 10,
      sourceUsageCount: usedSourceIds.length,
      sourceUsageRequirementSatisfied: usedSourceIds.length >= 10,
      output: {},
    };
  });

  const aggregate = aggregateSourceUsageResults(outputs, registry, contract, getSourceUsagePolicy("fast_research"));
  assert.ok(aggregate.validUsageCount >= 40, `expected >=40 validation-valid unique sources, got ${aggregate.validUsageCount}`);
  assert.equal(aggregate.passed, true);
});
