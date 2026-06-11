import type { BucketedQueryPlan } from "./types.js";

export function validateQueryPlan(plan: BucketedQueryPlan): BucketedQueryPlan {
  return {
    ...plan,
    queries: plan.queries
      .map((query) => ({
        ...query,
        query: normalizeQueryText(query.query),
      }))
      .filter((query) => query.query.length > 4 && !isTopicFreeGenericQuery(query.query)),
  };
}

function normalizeQueryText(query: string): string {
  return query
    .replace(/\b(20\d{2})(?:\s+\1)+\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isTopicFreeGenericQuery(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized === "india parliamentary policy issue"
    || normalized === "india parliament official source"
    || normalized === "india supreme court judgment"
    || /^india parliament official source 20\d{2}$/.test(normalized)
    || /^india supreme court judgment 20\d{2}$/.test(normalized);
}
