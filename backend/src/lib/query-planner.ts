import { decomposeQueryByDimension, type TopicType } from "./rag.js";
import type { DimensionEngineOutput, DimensionName } from "./types.js";
import { deduplicateQueriesSemantically } from "../services/retrieval.js";
import { enforceQueryMinimums, type PlannedQueries } from "../services/research-planner.js";
import { buildAgendaContract } from "../core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../core/retrieval/query-planner.js";
import type { SourceBucketId } from "../core/retrieval/source-buckets.js";
import { buildSearchSubjectWithArchiveGuard } from "../core/retrieval/query-planning/archive-context-guard.js";

export interface UnifiedQueryPlan {
  data_analyst: string[];
  legal_researcher: string[];
  policy_analyst: string[];
  current_affairs: string[];
  media_journalist?: string[];
  dimensionQueries: Partial<Record<string, string[]>>;
  totalQueryCount: number;
}

export async function buildUnifiedQueryPlan(
  userQuery: string,
  engine: DimensionEngineOutput,
  opts: {
    isDeep: boolean;
    groqKey?: string | null;
    archiveTopic?: string;
    topic?: TopicType;
  },
): Promise<UnifiedQueryPlan> {
  void opts.groqKey;
  const base = buildSearchSubject(userQuery, opts.archiveTopic);
  const official = buildOfficialRoleQueries(base, "deep_research");
  const dimensionQueries = await decomposeQueryByDimension(base, engine, opts.isDeep);

  const constitutional = [...(dimensionQueries.constitutional ?? []), ...(dimensionQueries.judiciary ?? [])];
  const economic = [...(dimensionQueries.economic ?? []), ...(dimensionQueries.governance ?? [])];
  const diplomatic = [...(dimensionQueries.diplomatic ?? []), ...(dimensionQueries.international_relations ?? [])];
  const humanRights = [...(dimensionQueries.human_rights ?? []), ...(dimensionQueries.media_information ?? [])];
  const security = [...(dimensionQueries.security ?? []), ...(dimensionQueries.strategic_affairs ?? [])];
  const maxPerRole = opts.isDeep ? 12 : 6;

  const enforced = enforceQueryMinimums({
    legal_researcher: deduplicateQueriesSemantically([
      ...official.legal_researcher,
      ...constitutional,
      `${base} Supreme Court India judgment site:indiankanoon.org`,
    ]).slice(0, maxPerRole),
    data_analyst: deduplicateQueriesSemantically([
      ...official.data_analyst,
      ...economic,
      `${base} India statistics 2024 2025`,
    ]).slice(0, maxPerRole),
    policy_analyst: deduplicateQueriesSemantically([
      ...official.policy_analyst,
      ...diplomatic,
      ...security,
      `${base} India policy official statement`,
    ]).slice(0, maxPerRole),
    current_affairs: deduplicateQueriesSemantically([
      ...official.current_affairs,
      `${base} India latest 2025`,
      `${base} recent developments India 2024`,
    ]).slice(0, opts.isDeep ? 6 : 3),
    media_journalist: humanRights.length > 0
      ? deduplicateQueriesSemantically([...humanRights, `${base} RSF Freedom House India 2024`]).slice(0, 8)
      : official.media_journalist,
  }, base, opts.topic ?? "default");

  const topicAware = applyTopicQueryOverlays(enforced, base);
  let plan: UnifiedQueryPlan = {
    ...topicAware,
    dimensionQueries,
    totalQueryCount: 0,
  };
  plan = enforceFullDimensionCoverage(plan, engine, base);
  plan.totalQueryCount = [
    plan.data_analyst,
    plan.legal_researcher,
    plan.policy_analyst,
    plan.current_affairs,
    plan.media_journalist ?? [],
  ].reduce((sum, queries) => sum + queries.length, 0);

  return plan;
}

function applyTopicQueryOverlays(
  planned: ReturnType<typeof enforceQueryMinimums>,
  subject: string,
): ReturnType<typeof enforceQueryMinimums> {
  if (!/\b(child sexual abuse|sexual abuse|pocso|marital rape|rape|sexual violence)\b/i.test(subject)) {
    return planned;
  }
  return {
    ...planned,
    data_analyst: deduplicateQueriesSemantically([
      "NCRB Crime in India POCSO child rape cases India 2022 2023",
      "NCRB crimes against children sexual offences POCSO India statistics",
      "NFHS India marital sexual violence domestic violence statistics",
      ...planned.data_analyst,
    ]).slice(0, 12),
    legal_researcher: deduplicateQueriesSemantically([
      "POCSO Act child sexual abuse India Supreme Court judgment",
      "Independent Thought v Union of India minor wife marital rape Supreme Court",
      "Exception 2 Section 375 IPC marital rape India Supreme Court Delhi High Court",
      "RIT Foundation marital rape Delhi High Court judgment",
      ...planned.legal_researcher,
    ]).slice(0, 12),
    policy_analyst: deduplicateQueriesSemantically([
      "Ministry Women Child Development POCSO rules India official",
      "Law Commission India marital rape report recommendation",
      "Parliament question marital rape POCSO child sexual abuse India",
      "PIB India POCSO Act child protection scheme",
      ...planned.policy_analyst,
    ]).slice(0, 12),
    current_affairs: deduplicateQueriesSemantically([
      "India marital rape Supreme Court latest 2024 2025",
      "India POCSO child sexual abuse latest NCRB 2024",
      ...planned.current_affairs,
    ]).slice(0, 8),
    media_journalist: deduplicateQueriesSemantically([
      "India child sexual abuse investigation POCSO survivors report",
      "India marital rape civil society report",
      ...(planned.media_journalist ?? []),
    ]).slice(0, 10),
  };
}

type PlannedRole = "data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs" | "media_journalist";

export function enforceFullDimensionCoverage(
  planned: UnifiedQueryPlan,
  engine: DimensionEngineOutput,
  userQuery: string,
): UnifiedQueryPlan {
  const allActiveDimensions = [
    ...engine.primaryDimensions,
    ...engine.secondaryDimensions,
  ];
  const next: UnifiedQueryPlan = {
    ...planned,
    data_analyst: [...planned.data_analyst],
    legal_researcher: [...planned.legal_researcher],
    policy_analyst: [...planned.policy_analyst],
    current_affairs: [...planned.current_affairs],
    media_journalist: planned.media_journalist ? [...planned.media_journalist] : planned.media_journalist,
  };

  for (const dimension of allActiveDimensions) {
    const existingCoverage = [
      ...next.data_analyst,
      ...next.legal_researcher,
      ...next.policy_analyst,
      ...next.current_affairs,
      ...(next.media_journalist ?? []),
    ].filter((query) => queryTargetsDimension(query, dimension.name)).length;

    if (existingCoverage >= 2) continue;

    const role = getDimensionRole(dimension.name);
    const targetedQueries = buildDimensionTargetQueries(userQuery, dimension.name);
    if (role === "media_journalist") {
      next.media_journalist = deduplicateQueriesSemantically([
        ...(next.media_journalist ?? []),
        ...targetedQueries,
      ]).slice(0, 12);
    } else {
      next[role] = deduplicateQueriesSemantically([
        ...next[role],
        ...targetedQueries,
      ]).slice(0, 12);
    }
  }

  return next;
}

function buildDimensionTargetQueries(userQuery: string, dimensionName: DimensionName): string[] {
  const readable = dimensionName.replace(/_/g, " ");
  return [
    `${userQuery} India ${readable} evidence report`,
    `${userQuery} India ${readable} policy legal data`,
  ].map((query) => query.trim().slice(0, 120));
}

export function buildSearchSubject(userQuery: string, archiveTopic?: string): string {
  const guarded = buildSearchSubjectWithArchiveGuard(userQuery, { archiveTopic });
  const withoutPromptPhrases = guarded.searchSubject
    .replace(/\b(?:deliberation|discussion|debate|brief|research|analysis)\s+(?:on|about|regarding)\b/gi, " ")
    .replace(/\b(?:write|prepare|make|give|generate)\b/gi, " ")
    .replace(/\b(?:model united nations|agenda)\b/gi, " ");
  const words = withoutPromptPhrases
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const stop = new Set([
    "and", "the", "for", "with", "that", "this", "from", "what", "have", "been",
    "does", "which", "about", "their", "there", "into", "over", "under", "your",
    "please", "need", "want", "india", "indian",
  ]);
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower.length <= 2 || stop.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    selected.push(word);
    if (selected.length >= 10) break;
  }
  const subject = selected.join(" ").trim();
  if (!subject) return userQuery.trim().slice(0, 120);
  return subject;
}

function buildOfficialRoleQueries(userQuery: string, mode: "deep_research" | "fast_research" | "council"): PlannedQueries {
  const contract = buildAgendaContract({ originalUserQuery: userQuery, outputDepth: "detailed" });
  const plan = buildBucketedQueryPlan(contract, mode);
  const grouped: PlannedQueries = {
    data_analyst: [],
    legal_researcher: [],
    policy_analyst: [],
    current_affairs: [],
    media_journalist: [],
  };
  for (const query of plan.queries) {
    const role = roleForBucket(query.bucketId);
    (grouped[role] ??= []).push(query.query);
  }
  return grouped;
}

function roleForBucket(bucketId: SourceBucketId): PlannedRole {
  if (bucketId === "court_legal" || bucketId === "legal_commentary") return "legal_researcher";
  if (bucketId === "government_official" || bucketId === "democracy_index" || bucketId === "electoral_integrity") return "data_analyst";
  if (bucketId === "indian_major_media" || bucketId === "human_rights_watchdog" || bucketId === "press_freedom" || bucketId === "civic_space" || bucketId === "digital_rights") return "media_journalist";
  if (bucketId === "parliamentary_records") return "current_affairs";
  return "policy_analyst";
}

function queryTargetsDimension(query: string, dimensionName: DimensionName): boolean {
  const normalizedQuery = query.toLowerCase().replace(/[_-]/g, " ");
  const terms = dimensionName.toLowerCase().split("_");
  return terms.every((term) => normalizedQuery.includes(term));
}

function getDimensionRole(dimensionName: DimensionName): PlannedRole {
  const dimensionRoleMap: Partial<Record<DimensionName, PlannedRole>> = {
    constitutional: "legal_researcher",
    judiciary: "legal_researcher",
    economic: "data_analyst",
    governance: "data_analyst",
    diplomatic: "policy_analyst",
    international_relations: "policy_analyst",
    security: "policy_analyst",
    strategic_affairs: "policy_analyst",
    media_information: "media_journalist",
    human_rights: "media_journalist",
    political: "current_affairs",
  };
  return dimensionRoleMap[dimensionName] ?? "policy_analyst";
}
