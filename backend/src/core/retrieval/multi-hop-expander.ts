import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { ResearchAngle } from "../archive/research-angle-engine.js";
import type { ResearchMode } from "../config/research-mode.js";
import type { BucketedQuery } from "./query-planner.js";
import type { RetrievalSource } from "./bucketed-retrieval.js";
import type { SourceBucketId } from "./source-buckets.js";

export interface MultiHopExpansionInput {
  round1Results: RetrievalSource[];
  agendaContract: AgendaContract;
  weakBuckets: SourceBucketId[];
  researchAngles: ResearchAngle[];
  mode?: ResearchMode;
}

export interface ExpandedQuerySet {
  entityQueries: BucketedQuery[];
  caseQueries: BucketedQuery[];
  indexQueries: BucketedQuery[];
  contrarianQueries: BucketedQuery[];
}

export const MULTI_HOP_CAPS: Record<"deep_research" | "council", number> = {
  deep_research: 10,
  council: 25,
};

const NOVELTY_STOP = 0.15;

export function multiHopCap(mode: ResearchMode | undefined): number {
  if (mode === "council") return MULTI_HOP_CAPS.council;
  return MULTI_HOP_CAPS.deep_research;
}

export function buildMultiHopExpansion(input: MultiHopExpansionInput): ExpandedQuerySet {
  const text = input.round1Results.map((source) => `${source.title} ${source.snippet ?? ""}`).join("\n");
  const caseNames = unique(text.match(/\b[A-Z][A-Za-z. ]+\s+v\.?\s+(?:State of|Union of|Election Commission|[A-Z][A-Za-z. ]+)/g) ?? []);
  const indexMentions = unique(text.match(/\b(?:V-Dem|Freedom House|RSF|World Press Freedom Index|International IDEA|EIU Democracy Index)\b/g) ?? []);
  const actNames = unique(text.match(/\b[A-Z][A-Za-z ]+\s+Act,?\s+\d{4}\b/g) ?? []);
  const entities = unique([
    ...input.agendaContract.requiredEntities,
    ...(text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) ?? []),
  ]);
  const weakBucket = input.weakBuckets[0] ?? "policy_research";
  const base = {
    expectedDomains: [] as string[],
    maxResultsPerQuery: 5,
    timeoutMs: 12000,
    priority: "top_up" as const,
  };
  const make = (prefix: string, bucketId: SourceBucketId, query: string, index: number): BucketedQuery => ({
    ...base,
    id: `${prefix}_${index + 1}`,
    bucketId,
    query,
  });

  const caseQueries = caseNames.slice(0, 8).map((name, index) => make("multi_case", "court_legal", `(site:indiankanoon.org OR site:sci.gov.in) "${name}"`, index));
  const indexQueries = indexMentions.slice(0, 5).map((name, index) => make("multi_index", "democracy_index", `"${name}" India ${input.agendaContract.temporalScope.endYear ?? ""} report score`, index));
  const actQueries = actNames.slice(0, 4).map((name, index) => make("multi_act", "government_official", `(site:pib.gov.in OR site:mha.gov.in OR site:egazette.nic.in) "${name}" amendment India`, index));
  const entityQueries = entities.slice(0, Math.max(0, 20 - caseQueries.length - indexQueries.length - actQueries.length)).map((name, index) => make("multi_entity", weakBucket, `"${name}" ${input.agendaContract.normalizedAgenda} India evidence`, index));
  const contrarianQueries = input.researchAngles.slice(0, 3).map((angle, index) => make("multi_contrarian", weakBucket, `${angle.title} counter evidence India ${input.agendaContract.normalizedAgenda}`, index));

  return {
    caseQueries,
    indexQueries,
    entityQueries: [...actQueries, ...entityQueries],
    contrarianQueries,
  };
}

/** Order: case/entity → contrarian → index. */
export function orderedMultiHopQueries(expansion: ExpandedQuerySet, cap: number): BucketedQuery[] {
  const groups = [
    [...expansion.caseQueries, ...expansion.entityQueries],
    expansion.contrarianQueries,
    expansion.indexQueries,
  ];
  const out: BucketedQuery[] = [];
  for (let index = 0; out.length < cap; index += 1) {
    let added = false;
    for (const group of groups) {
      const query = group[index];
      if (!query) continue;
      out.push(query);
      added = true;
      if (out.length >= cap) break;
    }
    if (!added) break;
  }
  return out;
}

export function hopBatchNovelty(prior: RetrievalSource[], batch: RetrievalSource[]): number {
  if (batch.length === 0) return 0;
  const priorDomains = new Set(prior.map((source) => domainOf(source)));
  const priorUrls = new Set(prior.map((source) => (source.canonicalUrl ?? source.url).toLowerCase()));
  let novel = 0;
  for (const source of batch) {
    const domain = domainOf(source);
    const url = (source.canonicalUrl ?? source.url).toLowerCase();
    const newDomain = !priorDomains.has(domain);
    const newEligible = !priorUrls.has(url) && (source.citationEligible === true || (source.score ?? 0) >= 40);
    if (newDomain || newEligible) novel += 1;
  }
  return novel / batch.length;
}

export function shouldStopOnLowNovelty(rolling: number[]): boolean {
  if (rolling.length < 3) return false;
  const window = rolling.slice(-3);
  const avg = window.reduce((sum, value) => sum + value, 0) / window.length;
  return avg < NOVELTY_STOP;
}

function domainOf(source: RetrievalSource): string {
  try {
    return new URL(source.canonicalUrl ?? source.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return (source.domain ?? "").toLowerCase();
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
