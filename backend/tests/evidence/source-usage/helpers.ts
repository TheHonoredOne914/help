import { buildAgendaContract, type AgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceRegistryCore, type RawEvidenceSourceInput } from "../../../src/core/evidence/evidence-registry.js";
import type { SourceBucketId } from "../../../src/core/retrieval/source-buckets.js";

export function makeContract(minimumEvidenceCardsPerModel = 1): AgendaContract {
  const contract = buildAgendaContract({
    requestId: "brick-16-source-usage",
    originalUserQuery: "AIPPM debate on Supreme Court federalism accountability and Article 14",
  });
  contract.minimumEvidenceCardsPerModel = minimumEvidenceCardsPerModel;
  return contract;
}

export function makeRegistry(
  sources: Array<Partial<RawEvidenceSourceInput> & { title: string; url: string }>,
  minimumEvidenceCardsPerModel = 1,
): { contract: AgendaContract; registry: EvidenceRegistryCore } {
  const contract = makeContract(minimumEvidenceCardsPerModel);
  const registry = buildEvidenceRegistryFromSources(sources.map((source, index) => ({
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl ?? source.url,
    domain: source.domain ?? new URL(source.url).hostname,
    date: source.date ?? "2026-05-01",
    bucketIds: source.bucketIds ?? ["policy_research"],
    sourceClass: source.sourceClass ?? "policy_research",
    authorityScore: source.authorityScore ?? 82,
    extractionQuality: source.extractionQuality ?? "full",
    fullText: source.fullText ?? `Source ${index + 1} states that the Supreme Court applied Article 14 proportionality standards to federal accountability in India.`,
    snippet: source.snippet ?? `Source ${index + 1} discusses Article 14 proportionality and federal accountability.`,
    keyFacts: source.keyFacts ?? [`The Supreme Court applied Article 14 proportionality standards to federal accountability.`],
    keyNumbers: source.keyNumbers ?? [],
    legalHoldings: source.legalHoldings ?? [],
    limitations: source.limitations ?? [],
    namedEntities: source.namedEntities ?? ["Supreme Court", "Article 14"],
    confidence: source.confidence ?? "high",
    citationEligible: source.citationEligible ?? true,
    topChunks: source.topChunks ?? [{
      text: source.fullText ?? `Source ${index + 1} states that the Supreme Court applied Article 14 proportionality standards to federal accountability in India.`,
      score: 91,
      chunkIndex: 0,
    }],
    limitedSource: source.limitedSource,
    citationStrength: source.citationStrength,
    enrichmentCard: source.enrichmentCard,
  })), contract);
  return { contract, registry };
}

export function source(
  id: number,
  overrides: Partial<RawEvidenceSourceInput> = {},
): Partial<RawEvidenceSourceInput> & { title: string; url: string } {
  return {
    title: `Source ${id}`,
    url: `https://example.org/source-${id}`,
    canonicalUrl: `https://example.org/source-${id}`,
    bucketIds: ["policy_research"] as SourceBucketId[],
    ...overrides,
  };
}
