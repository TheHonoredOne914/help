import type { ResearchMode } from "../../config/research-mode.js";
import type { SourceBucketId } from "../source-buckets.js";
import type { QueryCandidate, QueryPlanTelemetryEntry } from "./types.js";
import type { AgendaContract } from "../../agenda/agenda-contract.js";

export function makeTelemetryId(bucketId: SourceBucketId, index: number): string {
  return `${bucketId}_${index + 1}`;
}

export function telemetryForCandidate(args: {
  telemetryId: string;
  candidate: QueryCandidate;
  contract: AgendaContract;
  mode: ResearchMode;
  status: QueryPlanTelemetryEntry["status"];
  rejectedReason?: string;
  driftStatus?: QueryPlanTelemetryEntry["driftStatus"];
}): QueryPlanTelemetryEntry {
  return {
    telemetryId: args.telemetryId,
    queryText: args.candidate.query,
    bucketId: args.candidate.bucketId,
    topicType: args.contract.topicType,
    mode: args.mode,
    priority: args.candidate.priority ?? (/\bsite:/i.test(args.candidate.query) ? "domain_targeted" : "broad_discovery"),
    expectedDomains: args.candidate.expectedDomains ?? [],
    freshnessTags: args.candidate.freshnessTags ?? [],
    source: args.candidate.source,
    strategy: args.candidate.strategy ?? "baseline",
    status: args.status,
    driftStatus: args.driftStatus ?? "clean",
    rejectedReason: args.rejectedReason,
  };
}
