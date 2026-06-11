import type { AgendaContract } from "../../agenda/agenda-contract.js";
import { detectFreshnessNeeded } from "../../freshness/freshness-router.js";
import type { SourceBucketId } from "../source-buckets.js";
import { extractAgendaKeywords, normalizeQueryWhitespace } from "./agenda-keywords.js";
import type { QueryCandidate } from "./types.js";

const FRESHNESS_BUCKETS = new Set<SourceBucketId>(["government_official", "parliamentary_records", "court_legal", "indian_major_media", "policy_research"]);

export function buildFreshnessQueries(contract: AgendaContract, bucketId: SourceBucketId): QueryCandidate[] {
  const decision = detectFreshnessNeeded(contract.normalizedAgenda, "fast_research");
  const hasExplicitFreshness = contract.temporalScope.endYear !== null && !contract.temporalScope.explicit;
  if (!FRESHNESS_BUCKETS.has(bucketId) || (!decision.needed && !hasExplicitFreshness)) return [];
  const currentYear = contract.temporalScope.endYear ?? decision.currentYear;
  const previousYear = currentYear - 1;
  const keywords = extractAgendaKeywords(contract, 7);
  const bucketTarget = targetForBucket(bucketId);
  return [
    `${keywords} ${bucketTarget} latest current status update ${currentYear}`,
    `${keywords} ${bucketTarget} development trend ${previousYear} ${currentYear}`,
  ].map((query): QueryCandidate => ({
    bucketId,
    query: normalizeQueryWhitespace(query),
    source: "freshness",
    strategy: "timeline",
    freshnessTags: ["current", String(currentYear), String(previousYear)],
    priority: /site:/i.test(query) ? "domain_targeted" : "broad_discovery",
  }));
}

function targetForBucket(bucketId: SourceBucketId): string {
  switch (bucketId) {
    case "government_official": return "site:pib.gov.in government India";
    case "parliamentary_records": return "site:sansad.in parliament question India";
    case "court_legal": return "Supreme Court India judgment";
    case "policy_research": return "PRS India policy brief";
    default: return "Indian media";
  }
}
