import type { RawEvidenceSourceInput } from "../evidence/evidence-registry.js";
import { enrichSources, type EnrichedSource, type SourceEnrichmentOptions } from "../retrieval/source-enrichment.js";
import { COUNCIL_LIMITS } from "./council-config.js";
import type { CouncillorPlan, RetrievingCouncillorId } from "./council-types.js";

export interface CouncillorEnrichmentInput {
  brief: CouncillorPlan;
  rawSources: RawEvidenceSourceInput[];
  options: SourceEnrichmentOptions;
  councillorId: RetrievingCouncillorId;
  signal: AbortSignal;
}

export async function enrichForCouncillor(input: CouncillorEnrichmentInput): Promise<EnrichedSource[]> {
  const scopedSources = input.rawSources
    .filter((source) => source.url && source.title)
    .filter((source) => {
      const buckets = source.bucketIds ?? [];
      return buckets.length === 0 || buckets.some((bucketId) => input.brief.retrieval_focus.includes(bucketId));
    })
    .slice(0, COUNCIL_LIMITS.maxRawSourcesPerCouncillor)
    .map((source, index) => ({
      title: source.title ?? `Council source ${index + 1}`,
      url: source.url ?? "",
      canonicalUrl: source.canonicalUrl ?? source.url ?? "",
      domain: source.domain ?? domainFromUrl(source.url ?? ""),
      preloadedFullText: source.fullText ?? null,
      excerpt: source.fullText ?? source.excerpt ?? source.snippet ?? undefined,
      snippet: source.snippet ?? source.excerpt ?? undefined,
      bucketIds: source.bucketIds,
      authorityScore: source.authorityScore,
      score: source.authorityScore,
      foundByQuery: input.brief.query_lens,
    }));

  if (input.signal.aborted) throw new Error(`Council enrichment aborted for ${input.councillorId}`);
  const results = new Array<EnrichedSource>(scopedSources.length);
  const toEnrich: typeof scopedSources = [];
  const enrichIndexes: number[] = [];
  scopedSources.forEach((source, index) => {
    if (source.preloadedFullText?.trim()) {
      results[index] = {
        title: source.title,
        url: source.url,
        canonicalUrl: source.canonicalUrl,
        domain: source.domain,
        bucketIds: source.bucketIds,
        fullText: source.preloadedFullText,
        snippet: source.snippet ?? source.preloadedFullText.slice(0, 500),
        textLength: source.preloadedFullText.length,
        extractionMethod: "preloaded",
        extractionStatus: "success",
        fallbackExtractionUsed: false,
        extractionQuality: "high",
        citationEligible: true,
      };
      return;
    }
    enrichIndexes.push(index);
    toEnrich.push(source);
  });

  if (toEnrich.length > 0) {
    const enriched = await enrichSources(toEnrich, {
      ...input.options,
      query: input.brief.query_lens,
      abortSignal: input.signal,
      concurrency: input.options.concurrency ?? 4,
    });
    enriched.forEach((source, index) => {
      results[enrichIndexes[index]] = source;
    });
  }
  return results.filter((source): source is EnrichedSource => Boolean(source));
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
