import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";
import type { SourceBucketId } from "../source-buckets.js";
import { buildFallbackQueriesForBucket } from "./fallback-query-builder.js";
import { filterResolvedQueryDrift } from "./query-drift-filter.js";
import type { ProviderJsonLikeRouter, QueryCandidate, QueryExpansionOptions } from "./types.js";

const ALLOWED_BUCKETS = new Set<SourceBucketId>([
  "democracy_index", "government_official", "court_legal", "human_rights_watchdog", "civic_space",
  "press_freedom", "digital_rights", "electoral_integrity", "academic_research", "indian_major_media",
  "comparative_democracy", "parliamentary_records", "legal_commentary", "policy_research",
]);

export async function expandQueriesWithLlm(
  contract: AgendaContract,
  mode: ResearchMode,
  options: QueryExpansionOptions,
): Promise<{ queries: QueryCandidate[]; rejected: string[] }> {
  if (!options.providerRouter || !options.providerName || !options.model || (mode !== "deep_research" && mode !== "council")) {
    return deterministicFallback(contract);
  }
  try {
    const json = await requestExpansion(options.providerRouter, options.providerName, options.model, contract, mode, options.timeoutMs);
    const parsed = parseExpandedQueries(json, contract);
    if (parsed.queries.length === 0) return deterministicFallback(contract, parsed.rejected);
    return parsed;
  } catch (error) {
    return deterministicFallback(contract, [error instanceof Error ? error.message : String(error)]);
  }
}

function deterministicFallback(contract: AgendaContract, rejected: string[] = []): { queries: QueryCandidate[]; rejected: string[] } {
  return {
    queries: [
      ...buildFallbackQueriesForBucket(contract, "policy_research", "policy_pathways"),
      ...buildFallbackQueriesForBucket(contract, "parliamentary_records", "parliamentary_strategy"),
    ].slice(0, 6),
    rejected,
  };
}

async function requestExpansion(
  providerRouter: ProviderJsonLikeRouter,
  providerName: string,
  model: string,
  contract: AgendaContract,
  mode: ResearchMode,
  timeoutMs?: number,
): Promise<unknown> {
  const response = await providerRouter.completeJson(providerName, {
    model,
    roleName: "retrieval_critic_query_expansion",
    timeoutMs: timeoutMs ?? 8_000,
    temperature: 0.1,
    maxTokens: 1200,
    retries: 0,
    metadata: { requestId: contract.requestId, mode },
    messages: [
      { role: "system", content: "Return JSON only: {\"queries\":[{\"query\":\"...\",\"bucketId\":\"policy_research\",\"expectedDomains\":[\"prsindia.org\"],\"roleLens\":\"policy_pathways\",\"freshnessTags\":[\"current\"]}]}." },
      { role: "user", content: `Agenda: ${contract.normalizedAgenda}\nTopic: ${contract.topicType}\nMode: ${mode}\nEntities: ${contract.requiredEntities.join(", ")}\nLenses: ${contract.requiredLenses.join(", ")}` },
    ],
  });
  return response.json;
}

function parseExpandedQueries(json: unknown, contract: AgendaContract): { queries: QueryCandidate[]; rejected: string[] } {
  const rejected: string[] = [];
  if (!json || typeof json !== "object" || !Array.isArray((json as any).queries)) {
    return { queries: [], rejected: ["invalid expansion schema"] };
  }
  const queries: QueryCandidate[] = [];
  for (const item of (json as any).queries) {
    const query = typeof item?.query === "string" ? item.query.replace(/\s+/g, " ").trim() : "";
    const bucketId = item?.bucketId as SourceBucketId;
    if (!query || !ALLOWED_BUCKETS.has(bucketId)) {
      rejected.push(`invalid query item: ${JSON.stringify(item).slice(0, 120)}`);
      continue;
    }
    const drift = filterResolvedQueryDrift(query, contract);
    if (!drift.accepted) {
      rejected.push(drift.rejectedReason ?? "drift rejected");
      continue;
    }
    queries.push({
      bucketId,
      query,
      expectedDomains: Array.isArray(item.expectedDomains) ? item.expectedDomains.filter((domain: unknown): domain is string => typeof domain === "string") : [],
      roleLens: typeof item.roleLens === "string" ? item.roleLens : undefined,
      freshnessTags: Array.isArray(item.freshnessTags) ? item.freshnessTags.filter((tag: unknown): tag is string => typeof tag === "string") : [],
      source: "llm",
      strategy: "angle",
      priority: /\bsite:/i.test(query) ? "domain_targeted" : "broad_discovery",
    });
  }
  return { queries, rejected };
}
