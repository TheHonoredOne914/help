import { buildAgendaContract, type AgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { EvidenceRegistryCore, type EvidenceSourceInput, type EvidenceSource } from "../../../src/core/evidence/evidence-registry.js";

export function testContract(query = "AIPPM debate on electoral bonds, Article 19, Election Commission accountability, and Union ministry transparency"): AgendaContract {
  const contract = buildAgendaContract({ requestId: "brick-14-test", originalUserQuery: query, outputDepth: "deep_research" });
  contract.minimumUniqueCitedSources = 8;
  contract.minimumEvidenceCardsPerModel = 8;
  return contract;
}

export function testSource(overrides: Partial<EvidenceSourceInput> = {}): EvidenceSourceInput {
  const id = Number(overrides.url?.match(/source-(\d+)/)?.[1] ?? 1);
  return {
    title: `Evidence source ${id}`,
    url: `https://example${id}.org/source-${id}`,
    canonicalUrl: `https://example${id}.org/source-${id}`,
    domain: `example${id}.org`,
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    authorityScore: 78,
    date: "2025-01-15",
    fullText: `Source ${id} contains detailed evidence on Indian parliamentary accountability, floor strategy, and committee recommendations.`,
    snippet: `Source ${id} supports Indian parliamentary analysis.`,
    extractionQuality: "full",
    keyFacts: [`Source ${id} provides a specific claim for Indian parliamentary debate.`],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: ["Parliament of India"],
    limitations: [],
    confidence: "high",
    citationEligible: true,
    topChunks: [{ text: `Source ${id} top chunk on parliamentary accountability.`, score: 9, chunkIndex: 0 }],
    limitedSource: false,
    citationStrength: "medium",
    ...overrides,
  };
}

export function registryWith(sources: EvidenceSourceInput[], contract = testContract()): EvidenceRegistryCore {
  const registry = new EvidenceRegistryCore(contract);
  for (const source of sources) registry.addSource(source);
  return registry;
}

export function evidenceSource(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    id: 1,
    ...testSource({ url: "https://example1.org/source-1" }),
    canonicalUrl: "https://example1.org/source-1",
    domain: "example1.org",
    topChunks: [{ text: "Evidence source top chunk.", score: 9, chunkIndex: 0, sourceId: 1 }],
    ...overrides,
  } as EvidenceSource;
}
