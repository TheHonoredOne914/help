import type { AgendaContract } from "../agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EnrichmentCard, type EvidenceRegistryCore, type RawEvidenceSourceInput } from "../evidence/evidence-registry.js";
import type { SourceBucketId } from "../retrieval/source-buckets.js";
import type { EnrichedSource } from "../retrieval/source-enrichment.js";
import type { RetrievingCouncillorId } from "./council-types.js";

export function buildCouncillorRegistry(
  contract: AgendaContract,
  sources: RawEvidenceSourceInput[],
  _councillorId: RetrievingCouncillorId,
): EvidenceRegistryCore {
  return buildEvidenceRegistryFromSources(sources, contract);
}

export function mergeEnrichedForRegistry(
  rawSources: RawEvidenceSourceInput[],
  enrichedSources: EnrichedSource[],
): RawEvidenceSourceInput[] {
  const byCanonical = new Map<string, RawEvidenceSourceInput>();
  for (const source of rawSources) {
    if (source.url) byCanonical.set(canonicalKey(source.url), source);
  }
  return enrichedSources.map((source) => {
    const original = byCanonical.get(canonicalKey(source.url));
    const topChunks = source.sourceChunks?.slice(0, 8).map((chunk) => ({
      text: chunk.text,
      score: 0.7,
      chunkIndex: chunk.index,
    }));
    return {
      ...original,
      title: source.title,
      url: source.url,
      canonicalUrl: source.canonicalUrl ?? source.url,
      domain: source.domain,
      bucketIds: (original?.bucketIds ?? source.bucketIds) as SourceBucketId[] | undefined,
      sourceClass: original?.sourceClass,
      authorityScore: original?.authorityScore ?? 72,
      date: original?.date ?? null,
      fullText: source.fullText,
      excerpt: source.fullText ?? source.snippet ?? original?.excerpt ?? null,
      snippet: source.snippet ?? original?.snippet ?? null,
      extractionQuality: source.extractionMethod === "failed"
        ? "failed"
        : source.extractionMethod === "snippet_fallback"
          ? "snippet"
          : source.extractionQuality === "high"
            ? "full"
            : "partial",
      extractionProvider: source.extractionProvider,
      extractionStatus: source.extractionStatus,
      fallbackExtractionUsed: source.fallbackExtractionUsed,
      citationEligible: source.citationEligible,
      enrichmentCard: source.enrichmentCard as EnrichmentCard | undefined,
      topChunks,
      keyFacts: source.enrichmentCard?.evidenceItems?.map((item) => item.claim).filter(Boolean),
      limitations: [
        ...(original?.limitations ?? []),
        ...(source.enrichmentError ? [`Enrichment warning: ${source.enrichmentError}`] : []),
      ],
    };
  });
}

function canonicalKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
