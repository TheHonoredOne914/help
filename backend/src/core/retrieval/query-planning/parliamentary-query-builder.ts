import type { AgendaContract } from "../../agenda/agenda-contract.js";
import { extractAgendaKeywords, normalizeQueryWhitespace } from "./agenda-keywords.js";
import type { QueryCandidate } from "./types.js";

export function buildParliamentaryQueries(contract: AgendaContract): QueryCandidate[] {
  if (contract.debateMode !== "indian_parliamentary") return [];
  const keywords = extractAgendaKeywords(contract, 8);
  const queries = [
    `site:sansad.in ${keywords} parliament question`,
    `site:prsindia.org ${keywords} bill committee report`,
    `${keywords} Lok Sabha Rajya Sabha debate`,
    `${keywords} standing committee report Parliament India`,
  ];
  return queries.map((query): QueryCandidate => ({
    bucketId: "parliamentary_records",
    query: normalizeQueryWhitespace(query),
    source: "parliamentary",
    strategy: "primary_source",
    roleLens: "parliamentary_strategy",
    priority: /site:/i.test(query) ? "domain_targeted" : "broad_discovery",
    expectedDomains: ["sansad.in", "prsindia.org", "loksabha.nic.in", "rajyasabha.nic.in"],
  }));
}
