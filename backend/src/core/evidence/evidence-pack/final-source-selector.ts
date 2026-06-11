import type { ResearchMode } from "../../config/research-mode.js";
import type { SourceBucketId } from "../../retrieval/source-buckets.js";
import type { EvidenceSource } from "../evidence-registry.js";
import { citationStrengthBonus, sourceQualityScore } from "./citation-strength-ranker.js";
import { scoreQueryRelevance } from "./query-relevance-scorer.js";
import { safeDomainKey } from "./safe-url.js";

export interface FinalSourceSelectionOptions {
  query?: string;
  limit: number;
  mode?: ResearchMode;
  requiredBuckets?: SourceBucketId[];
  sourceUsageIds?: number[];
  forceSourceIds?: number[];
  mustIncludeSourceIds?: number[];
}

export function selectFinalSources(sources: EvidenceSource[], options: FinalSourceSelectionOptions): EvidenceSource[] {
  const limit = Math.max(0, options.limit);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const requiredIds = new Set([...(options.forceSourceIds ?? []), ...(options.mustIncludeSourceIds ?? [])]);
  const sourceUsageIds = new Set(options.sourceUsageIds ?? []);
  const requiredBuckets = options.requiredBuckets ?? [];
  const ranked = [...sources].sort((a, b) => scoreSource(b, options.query ?? "", sourceUsageIds, requiredIds) - scoreSource(a, options.query ?? "", sourceUsageIds, requiredIds) || a.id - b.id);
  const selected: EvidenceSource[] = [];
  const selectedIds = new Set<number>();

  for (const sourceId of requiredIds) {
    const source = sourceById.get(sourceId);
    if (source) pushSelected(source, selected, selectedIds);
  }

  for (const bucketId of requiredBuckets) {
    if (selected.some((source) => source.bucketIds.includes(bucketId))) continue;
    const representative = ranked.find((source) => source.bucketIds.includes(bucketId) && !selectedIds.has(source.id));
    if (representative) pushSelected(representative, selected, selectedIds);
    if (selected.length >= limit) return selected.slice(0, limit);
  }

  const domainSeen = new Map<string, number>();
  for (const source of selected) {
    const domain = safeDomainKey(source.url, source.domain);
    domainSeen.set(domain, (domainSeen.get(domain) ?? 0) + 1);
  }
  const earlyCap = options.mode === "fast_research" ? 3 : 4;
  const maxCap = 4;
  const deferred: EvidenceSource[] = [];

  for (const source of ranked) {
    if (selected.length >= limit) break;
    if (selectedIds.has(source.id)) continue;
    const domain = safeDomainKey(source.url, source.domain);
    const count = domainSeen.get(domain) ?? 0;
    const cap = selected.length < Math.min(12, limit) ? earlyCap : maxCap;
    if (count >= cap) {
      deferred.push(source);
      continue;
    }
    pushSelected(source, selected, selectedIds);
    domainSeen.set(domain, count + 1);
  }

  for (const source of deferred) {
    if (selected.length >= limit) break;
    if (selectedIds.has(source.id)) continue;
    const domain = safeDomainKey(source.url, source.domain);
    const count = domainSeen.get(domain) ?? 0;
    if (count >= maxCap) continue;
    pushSelected(source, selected, selectedIds);
    domainSeen.set(domain, count + 1);
  }

  return selected.slice(0, limit);
}

function scoreSource(source: EvidenceSource, query: string, sourceUsageIds: Set<number>, requiredIds: Set<number>): number {
  return scoreQueryRelevance(source, query) * 0.6
    + Math.max(0, Math.min(100, source.authorityScore)) * 0.25
    + citationStrengthBonus(source.citationStrength)
    + sourceQualityScore(source) / 20
    + (sourceUsageIds.has(source.id) ? 20 : 0)
    + (requiredIds.has(source.id) ? 1_000 : 0)
    - (source.limitedSource ? 12 : 0);
}

function pushSelected(source: EvidenceSource, selected: EvidenceSource[], selectedIds: Set<number>): void {
  if (selectedIds.has(source.id)) return;
  selected.push(source);
  selectedIds.add(source.id);
}
