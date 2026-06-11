import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { ResearchAngle } from "../archive/research-angle-engine.js";
import type { BucketedQuery } from "./query-planner.js";
import type { RetrievalSource } from "./bucketed-retrieval.js";
import type { SourceBucketId } from "./source-buckets.js";

export interface MultiHopExpansionInput {
  round1Results: RetrievalSource[];
  agendaContract: AgendaContract;
  weakBuckets: SourceBucketId[];
  researchAngles: ResearchAngle[];
}

export interface ExpandedQuerySet {
  entityQueries: BucketedQuery[];
  caseQueries: BucketedQuery[];
  indexQueries: BucketedQuery[];
  contrarianQueries: BucketedQuery[];
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

  const all = [...caseQueries, ...indexQueries, ...actQueries, ...entityQueries, ...contrarianQueries].slice(0, 20);
  return {
    caseQueries: all.filter((query) => query.id.startsWith("multi_case")),
    indexQueries: all.filter((query) => query.id.startsWith("multi_index")),
    entityQueries: all.filter((query) => query.id.startsWith("multi_entity") || query.id.startsWith("multi_act")),
    contrarianQueries: all.filter((query) => query.id.startsWith("multi_contrarian")),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
