import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { QueryDriftStatus } from "./types.js";

export interface QueryDriftResult {
  accepted: boolean;
  driftStatus: QueryDriftStatus;
  detectedTerms: string[];
  rejectedReason?: string;
}

export function filterResolvedQueryDrift(query: string, contract: AgendaContract): QueryDriftResult {
  const lower = query.toLowerCase();
  const detectedTerms = contract.forbiddenDriftTerms
    .filter((term) => lower.includes(term.toLowerCase()))
    .filter((term, index, all) => all.findIndex((other) => other.toLowerCase() === term.toLowerCase()) === index);
  if (detectedTerms.length > 0) {
    return {
      accepted: false,
      driftStatus: "rejected",
      detectedTerms,
      rejectedReason: `Rejected drift terms: ${detectedTerms.join(", ")}`,
    };
  }
  return { accepted: true, driftStatus: "clean", detectedTerms: [] };
}
