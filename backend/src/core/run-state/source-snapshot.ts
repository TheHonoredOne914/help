import type { SerializedCitationReport, SerializedSourceSnapshot } from "./types.js";

export function normalizeCitationReport(input: any, totalCitationEligibleSources = 0): SerializedCitationReport {
  const rawCitedSourceIds = Array.isArray(input?.citedSourceIds)
    ? input.citedSourceIds.map(Number).filter(Number.isFinite)
    : Array.isArray(input?.sourceIdsActuallyUsed)
      ? input.sourceIdsActuallyUsed.map(Number).filter(Number.isFinite)
      : [];
  const citedSourceIds: number[] = rawCitedSourceIds.map((id: unknown) => Number(id)).filter(Number.isFinite);
  const finalUniqueCitedSources = Number(input?.finalUniqueCitedSources ?? input?.uniqueCitedSourceCount ?? new Set(citedSourceIds).size);
  return {
    finalUniqueCitedSources,
    totalLinkedCitations: Number(input?.totalLinkedCitations ?? input?.linkedCitationCount ?? finalUniqueCitedSources),
    citedSourceIds: [...new Set(citedSourceIds)],
    citationCoverage: Number(input?.citationCoverage ?? (totalCitationEligibleSources > 0 ? finalUniqueCitedSources / totalCitationEligibleSources : 0)),
    invalidCitations: input?.invalidCitations ?? [],
    rejectedCitations: input?.rejectedCitations ?? [],
    citedBuckets: input?.citedBuckets ?? [],
    missingSourceBuckets: input?.missingSourceBuckets ?? [],
  };
}

export function buildSourceSnapshot(sources: unknown, citedSourceIds: number[]): SerializedSourceSnapshot[] {
  const cited = new Set(citedSourceIds);
  const sourceList = Array.isArray(sources) ? sources : [];
  return sourceList
    .map((source: any) => ({
      sourceId: typeof source?.sourceId === "number" ? source.sourceId : typeof source?.id === "number" ? source.id : undefined,
      title: String(source?.title ?? ""),
      url: String(source?.url ?? ""),
      sourceType: source?.sourceType ?? source?.sourceClass,
      bucketIds: Array.isArray(source?.bucketIds) ? source.bucketIds : undefined,
      cited: cited.has(Number(source?.sourceId ?? source?.id)),
      discoveredBy: Array.isArray(source?.discoveredBy) ? source.discoveredBy : undefined,
      extractedBy: source?.extractedBy,
      fallbackExtractionUsed: source?.fallbackExtractionUsed === true,
    }))
    .filter((source) => source.title || source.url);
}
