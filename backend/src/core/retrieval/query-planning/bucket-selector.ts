import type { AgendaContract } from "../../agenda/agenda-contract.js";
import { getSourceBucketsForAgenda, type SourceBucket } from "../source-buckets.js";

export function selectQueryBuckets(contract: AgendaContract): SourceBucket[] {
  return getSourceBucketsForAgenda(contract);
}
