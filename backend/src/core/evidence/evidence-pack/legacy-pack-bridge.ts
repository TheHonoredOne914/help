import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { SourceBucketId } from "../../retrieval/source-buckets.js";
import { buildEvidenceRegistryFromSources } from "../evidence-registry.js";
import type { RawEvidenceSourceInput, SourceClass } from "../evidence-registry-types.js";

export interface LegacyEvidenceSource {
  title?: string;
  url?: string;
  score?: number;
  authorityScore?: number;
  content?: string;
  fullText?: string;
  snippet?: string;
  excerpt?: string;
  bucketIds?: SourceBucketId[];
  sourceClass?: SourceClass;
  date?: string | null;
}

export function normalizeLegacyAuthorityScore(score: number | null | undefined): number {
  const value = Number.isFinite(score) ? Number(score) : 0;
  const normalized = value > 0 && value <= 10 ? value * 10 : value;
  return Math.max(0, Math.min(100, normalized));
}

export function buildEvidenceRegistryFromLegacySources(sources: LegacyEvidenceSource[], contract: AgendaContract) {
  const normalized: RawEvidenceSourceInput[] = sources.map((source, index) => {
    const rawText = source.content ?? source.fullText ?? source.excerpt ?? source.snippet ?? "";
    return {
      title: source.title ?? `Legacy source ${index + 1}`,
      url: source.url ?? `legacy-source-${index + 1}`,
      authorityScore: normalizeLegacyAuthorityScore(source.authorityScore ?? source.score),
      fullText: rawText,
      snippet: source.snippet ?? source.excerpt ?? rawText.slice(0, 500),
      excerpt: source.excerpt ?? rawText,
      bucketIds: source.bucketIds,
      sourceClass: source.sourceClass,
      date: source.date ?? null,
      extractionQuality: rawText.trim().length > 220 ? "full" : rawText.trim() ? "partial" : "failed",
      citationEligible: true,
    };
  });
  return buildEvidenceRegistryFromSources(normalized, contract);
}
