import type { PlannedBucketQuery, QueryCandidate, QueryPlanTelemetryEntry } from "./types.js";

const DEDUPE_STOPWORDS = new Set(["india", "indian", "policy", "report", "latest", "current", "status", "evidence"]);

export function deduplicateQueryTexts(queries: string[]): string[] {
  const selected: string[] = [];
  for (const query of queries) {
    if (selected.every((existing) => !isNearDuplicate(existing, query) || hasDifferentSiteTarget(existing, query))) {
      selected.push(query);
    }
  }
  return selected;
}

export function dedupePlannedQueries(queries: PlannedBucketQuery[]): { queries: PlannedBucketQuery[]; deduped: PlannedBucketQuery[] } {
  const kept: PlannedBucketQuery[] = [];
  const deduped: PlannedBucketQuery[] = [];
  for (const query of queries) {
    const duplicate = kept.find((existing) =>
      !isProtectedStrategy(query)
      && !isProtectedStrategy(existing)
      && isNearDuplicate(existing.query, query.query)
      && !hasDifferentSiteTarget(existing.query, query.query)
    );
    if (duplicate) {
      deduped.push({ ...query, rejectedReason: `Near duplicate of ${duplicate.id}` });
    } else {
      kept.push(query);
    }
  }
  return { queries: kept, deduped };
}

export function dedupedTelemetryEntries(deduped: PlannedBucketQuery[]): QueryPlanTelemetryEntry[] {
  return deduped.map((query) => ({
    telemetryId: query.telemetryId ?? query.id,
    queryText: query.query,
    bucketId: query.bucketId,
    topicType: query.topicType ?? "generic_indian_parliament",
    mode: "deep_research",
    priority: query.priority,
    expectedDomains: query.expectedDomains,
    freshnessTags: query.freshnessTags ?? [],
    source: query.source ?? "static",
    strategy: query.strategy ?? "baseline",
    status: "deduped",
    driftStatus: query.driftStatus ?? "clean",
    rejectedReason: query.rejectedReason ?? "Near duplicate query",
  }));
}

export function queryKey(query: string): string {
  return query
    .replace(/\bsite:([^\s)]+)/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !DEDUPE_STOPWORDS.has(word.toLowerCase()))
    .map((word) => word.toUpperCase() === word ? word : word.toLowerCase())
    .join(" ");
}

export function candidateToText(candidate: QueryCandidate): string {
  return candidate.query;
}

function isNearDuplicate(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const aWords = new Set(queryKey(a).split(/\s+/).filter((word) => word.length > 2));
  const bWords = new Set(queryKey(b).split(/\s+/).filter((word) => word.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return false;
  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  return intersection / Math.min(aWords.size, bWords.size) >= 0.86;
}

function hasDifferentSiteTarget(a: string, b: string): boolean {
  const siteA = a.match(/\bsite:([^\s)]+)/i)?.[1]?.toLowerCase();
  const siteB = b.match(/\bsite:([^\s)]+)/i)?.[1]?.toLowerCase();
  return Boolean((siteA || siteB) && siteA !== siteB);
}

function isProtectedStrategy(query: PlannedBucketQuery): boolean {
  return query.source === "llm"
    || query.source === "parliamentary"
    || query.strategy === "timeline"
    || query.strategy === "counterargument"
    || query.strategy === "comparative";
}
