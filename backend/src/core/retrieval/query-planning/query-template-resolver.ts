import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { SourceBucket } from "../source-buckets.js";
import { compactAgendaSubject, extractAgendaKeywords, normalizeQueryWhitespace } from "./agenda-keywords.js";

export function resolveQueryTemplate(template: string, contract: AgendaContract, bucket?: SourceBucket): string {
  const subject = compactAgendaSubject(contract);
  let query = template.includes("{agenda}")
    ? template.replace(/\{agenda\}/g, subject)
    : template;
  if (!template.includes("{agenda}") && shouldAppendSubject(query, subject)) {
    query = `${query} ${subject}`;
  }
  if (bucket?.id === "parliamentary_records" && !/parliament|sansad|prs|lok sabha|rajya sabha/i.test(query)) {
    query = `${query} parliament`;
  }
  if (contract.countryFocus === "India" && !/\bIndia\b|\bIndian\b/i.test(query) && !/^site:/i.test(query)) {
    query = `India ${query}`;
  }
  const years = yearsToAppend(contract, query);
  return normalizeQueryWhitespace(`${query} ${years}`.trim());
}

export function buildSubjectQuery(contract: AgendaContract, suffix: string): string {
  return normalizeQueryWhitespace(`${extractAgendaKeywords(contract, 8)} ${suffix}`);
}

function shouldAppendSubject(query: string, subject: string): boolean {
  const subjectTerms = subject.split(/\s+/).filter((term) => term.length > 3).slice(0, 4);
  if (subjectTerms.length === 0) return false;
  const hits = subjectTerms.filter((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(query)).length;
  return hits < Math.min(2, subjectTerms.length);
}

function yearsToAppend(contract: AgendaContract, query: string): string {
  const years = [
    contract.temporalScope.startYear,
    contract.temporalScope.endYear,
  ].filter((year): year is number => typeof year === "number");
  return [...new Set(years)]
    .filter((year) => !new RegExp(`\\b${year}\\b`).test(query))
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
