import type { TopicType } from "../lib/rag.js";
import type { DimensionEngineOutput } from "../lib/types.js";
import { deduplicateQueriesSemantically } from "./retrieval.js";
import { buildAgendaContract } from "../core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../core/retrieval/query-planner.js";
import type { SourceBucketId } from "../core/retrieval/source-buckets.js";

export interface PlannedQueries {
  data_analyst: string[];
  legal_researcher: string[];
  policy_analyst: string[];
  current_affairs: string[];
  media_journalist?: string[];
}

export function buildDeterministicPlan(query: string): PlannedQueries {
  return officialPlannerRoleQueries(query, "deep_research");
}

export function buildPlannerPrompt(query: string, engine: DimensionEngineOutput): string {
  return [
    "Plan search queries for an Indian parliamentary research engine.",
    `Agenda: ${query}`,
    `Primary dimensions: ${engine.primaryDimensions.map(d => d.name).join(", ")}`,
    "Return compact, source-targeted queries only.",
  ].join("\n");
}

export function buildTopicSourceStrategy(engine: DimensionEngineOutput): string[] {
  const top = engine.primaryDimensions.map(d => d.name);
  if (top.includes("media_information")) return ["rsf.org", "cpj.org", "freedomhouse.org", "thewire.in"];
  if (top.includes("constitutional") || top.includes("judiciary")) return ["indiankanoon.org", "sci.gov.in", "prsindia.org"];
  if (top.includes("economic")) return ["rbi.org.in", "mospi.gov.in", "indiabudget.gov.in", "worldbank.org"];
  return ["pib.gov.in", "mea.gov.in", "prsindia.org", "thehindu.com"];
}

export function validatePlannedQueries(queries: string[]): string[] {
  return deduplicateQueriesSemantically(queries.map(clampPlannerQuery).filter(isUsablePlannerQuery));
}

export function clampPlannerQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function reconcilePlanWithDimensions(plan: PlannedQueries, dimensionQueries: string[]): PlannedQueries {
  const extra = deduplicateByTfIdf(dimensionQueries);
  const subjectSeed = firstTopicBearingQuery(plan) ?? extra.find((query) => query.trim().length > 0) ?? "";
  return enforceQueryMinimums({
    data_analyst: validatePlannedQueries([...plan.data_analyst, ...extra.slice(0, 3)]),
    legal_researcher: validatePlannedQueries([...plan.legal_researcher, ...extra.filter(q => /court|law|article|section|judg/i.test(q)).slice(0, 3)]),
    policy_analyst: validatePlannedQueries([...plan.policy_analyst, ...extra.slice(3, 7)]),
    current_affairs: validatePlannedQueries([...plan.current_affairs, ...extra.filter(q => /2024|2025|latest/i.test(q)).slice(0, 2)]),
    media_journalist: validatePlannedQueries([...(plan.media_journalist ?? []), ...extra.filter(q => /media|press|journalist|civil/i.test(q)).slice(0, 2)]),
  }, subjectSeed, "default");
}

export const MINIMUM_QUERIES_PER_ROLE = {
  data_analyst: 6,
  legal_researcher: 5,
  policy_analyst: 5,
  current_affairs: 4,
  media_journalist: 4,
} as const;

export function enforceQueryMinimums(planned: PlannedQueries, userQuery: string, topic: TopicType | string | "default"): PlannedQueries {
  const q = userQuery.trim();
  const fallbackSeed = q || firstTopicBearingQuery(planned);
  const needsFallback = (Object.entries(MINIMUM_QUERIES_PER_ROLE) as Array<[keyof Required<PlannedQueries>, number]>)
    .some(([role, minimum]) => (planned[role] ?? []).length < minimum);
  if (needsFallback && !fallbackSeed) {
    throw new Error("A topic-bearing user query is required before planner fallback queries can be generated.");
  }
  const fallbackPlan = fallbackSeed ? officialPlannerRoleQueries(fallbackSeed, "deep_research") : {
    data_analyst: [],
    legal_researcher: [],
    policy_analyst: [],
    current_affairs: [],
    media_journalist: [],
  };

  const next: PlannedQueries = {
    ...planned,
    data_analyst: [...planned.data_analyst],
    legal_researcher: [...planned.legal_researcher],
    policy_analyst: [...planned.policy_analyst],
    current_affairs: [...planned.current_affairs],
    media_journalist: [...(planned.media_journalist ?? [])],
  };

  for (const [role, minimum] of Object.entries(MINIMUM_QUERIES_PER_ROLE) as Array<[keyof Required<PlannedQueries>, number]>) {
    const current = next[role] ?? [];
    if (current.length < minimum) {
      const officialFallbacks = [
        ...topicFallbackQueries(role, fallbackSeed ?? "", topic),
        ...(fallbackPlan[role] ?? []),
        ...roleFallbackQueries(role, fallbackSeed ?? ""),
      ];
      current.push(...officialFallbacks.slice(0, minimum - current.length));
      next[role] = uniquePlannerQueries(current);
    }
  }

  return next;
}

function isUsablePlannerQuery(query: string): boolean {
  const cleaned = query.trim();
  if (!cleaned) return false;
  if (/^[A-Z0-9]{3,8}$/.test(cleaned) && !["THE", "AND", "FOR"].includes(cleaned)) return true;
  return cleaned.length > 8;
}

function firstTopicBearingQuery(plan: PlannedQueries): string | undefined {
  return [
    ...plan.data_analyst,
    ...plan.legal_researcher,
    ...plan.policy_analyst,
    ...plan.current_affairs,
    ...(plan.media_journalist ?? []),
  ].find((query) => query.trim().length > 0);
}

function officialPlannerRoleQueries(query: string, mode: "deep_research" | "fast_research" | "council"): PlannedQueries {
  const contract = buildAgendaContract({ originalUserQuery: query, outputDepth: "detailed" });
  const plan = buildBucketedQueryPlan(contract, mode);
  const grouped: PlannedQueries = {
    data_analyst: [],
    legal_researcher: [],
    policy_analyst: [],
    current_affairs: [],
    media_journalist: [],
  };
  for (const planned of plan.queries) {
    const role = roleForBucket(planned.bucketId);
    (grouped[role] ??= []).push(planned.query);
  }
  return {
    data_analyst: uniquePlannerQueries(grouped.data_analyst),
    legal_researcher: uniquePlannerQueries(grouped.legal_researcher),
    policy_analyst: uniquePlannerQueries(grouped.policy_analyst),
    current_affairs: uniquePlannerQueries(grouped.current_affairs),
    media_journalist: uniquePlannerQueries(grouped.media_journalist ?? []),
  };
}

function roleForBucket(bucketId: SourceBucketId): keyof Required<PlannedQueries> {
  if (bucketId === "court_legal" || bucketId === "legal_commentary") return "legal_researcher";
  if (bucketId === "government_official" || bucketId === "democracy_index" || bucketId === "electoral_integrity") return "data_analyst";
  if (bucketId === "indian_major_media" || bucketId === "human_rights_watchdog" || bucketId === "press_freedom" || bucketId === "civic_space" || bucketId === "digital_rights") return "media_journalist";
  if (bucketId === "parliamentary_records") return "current_affairs";
  return "policy_analyst";
}

function roleFallbackQueries(role: keyof Required<PlannedQueries>, query: string): string[] {
  const base = query.replace(/\s+/g, " ").trim();
  switch (role) {
    case "data_analyst":
      return [`${base} India official data statistics`, `${base} India government report`, `${base} data.gov.in statistics India`];
    case "legal_researcher":
      return [`${base} Supreme Court India judgment`, `${base} constitutional challenge India`, `${base} legal commentary India`];
    case "policy_analyst":
      return [`${base} PRS India policy brief`, `${base} NITI Aayog policy analysis`, `${base} parliamentary committee policy report`];
    case "current_affairs":
      return [`${base} India latest development`, `${base} parliament question recent India`, `${base} government update India`];
    case "media_journalist":
      return [`${base} The Hindu analysis`, `${base} Indian Express explained`, `${base} credible Indian media report`, `${base} civil society response India`];
  }
}

function topicFallbackQueries(role: keyof Required<PlannedQueries>, query: string, topic: TopicType | string | "default"): string[] {
  const base = query.replace(/\s+/g, " ").trim();
  if (!base) return [];
  const topicKey = String(topic);
  if (topicKey === "technology_data_ai_governance") {
    switch (role) {
      case "data_analyst":
        return [`${base} MeitY data protection rules official`, `${base} India digital privacy government report`];
      case "legal_researcher":
        return [`${base} privacy proportionality Supreme Court India`, `${base} DPDP Act constitutional challenge India`];
      case "policy_analyst":
        return [`${base} PRS India DPDP Act analysis`, `${base} data protection policy India`];
      case "current_affairs":
        return [`${base} DPDP rules latest India`, `${base} MeitY data protection update`];
      case "media_journalist":
        return [`${base} MediaNama privacy analysis India`, `${base} Internet Freedom Foundation DPDP analysis`];
    }
  }
  if (topicKey === "media_press") {
    switch (role) {
      case "data_analyst":
        return [`${base} RSF India press freedom index`, `${base} CPJ India journalist data`];
      case "legal_researcher":
        return [`${base} Article 19 Supreme Court India press freedom`, `${base} UAPA sedition journalist India court`];
      case "policy_analyst":
        return [`${base} press freedom policy India`, `${base} digital news regulation India`];
      case "current_affairs":
        return [`${base} journalist arrest India latest`, `${base} press freedom India 2025`];
      case "media_journalist":
        return [`${base} The Hindu Indian Express press freedom`, `${base} The Wire Scroll press freedom India`];
    }
  }
  if (topicKey === "democracy_civil_liberties") {
    switch (role) {
      case "data_analyst":
        return [`${base} Freedom House India score`, `${base} V-Dem India democracy index`];
      case "legal_researcher":
        return [`${base} civil liberties Supreme Court India`, `${base} UAPA dissent Supreme Court India`];
      case "policy_analyst":
        return [`${base} civil society India policy analysis`, `${base} democratic institutions India analysis`];
      case "current_affairs":
        return [`${base} civil liberties India latest`, `${base} democratic space India latest`];
      case "media_journalist":
        return [`${base} HRW India civil liberties`, `${base} Amnesty CIVICUS India civil society`];
    }
  }
  return [];
}

function uniquePlannerQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const query of queries) {
    const cleaned = clampPlannerQuery(query);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function deduplicateByTfIdf(queries: string[]): string[] {
  const vectors = queries.map(toTermVector);
  const selected: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    if (selected.every(j => cosine(vectors[i], vectors[j]) < 0.82)) selected.push(i);
  }
  return selected.map(i => queries[i]);
}

function toTermVector(text: string): Map<string, number> {
  const words = text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3);
  const vector = new Map<string, number>();
  for (const word of words) vector.set(word, (vector.get(word) ?? 0) + 1);
  return vector;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const value of a.values()) magA += value * value;
  for (const value of b.values()) magB += value * value;
  for (const [key, value] of a) dot += value * (b.get(key) ?? 0);
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
