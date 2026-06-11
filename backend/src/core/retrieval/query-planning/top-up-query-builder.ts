import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { SourceBucketId } from "../source-buckets.js";
import { extractAgendaKeywords, normalizeQueryWhitespace } from "./agenda-keywords.js";
import type { QueryCandidate } from "./types.js";

const TOP_UP_PATTERNS: Partial<Record<SourceBucketId, string[]>> = {
  government_official: ["site:pib.gov.in {keywords} India policy", "site:mha.gov.in {keywords} India policy", "{keywords} India government report"],
  parliamentary_records: ["site:sansad.in {keywords} parliament question", "site:prsindia.org {keywords} bill committee"],
  court_legal: ["site:sci.gov.in {keywords} Supreme Court judgment", "{keywords} Supreme Court India legal holding"],
  policy_research: ["site:prsindia.org {keywords} policy brief", "{keywords} India policy research report"],
  academic_research: ["{keywords} India academic research", "site:epw.in {keywords} India"],
  indian_major_media: ["site:thehindu.com {keywords} India", "site:indianexpress.com {keywords} India"],
  human_rights_watchdog: ["site:hrw.org {keywords} India", "site:amnesty.org {keywords} India"],
  digital_rights: ["site:internetfreedom.in {keywords} India", "site:accessnow.org {keywords} India"],
  press_freedom: ["site:rsf.org {keywords} India", "site:cpj.org {keywords} India"],
  electoral_integrity: ["site:eci.gov.in {keywords} India", "site:adrindia.org {keywords} India"],
};

export function buildTopicAwareTopUpQuery(bucketId: SourceBucketId, contract: AgendaContract, variant = 0): string {
  const keywords = extractAgendaKeywords(contract, 7);
  const patterns = TOP_UP_PATTERNS[bucketId] ?? ["{keywords} India evidence report"];
  const selected = patterns[variant % patterns.length] ?? patterns[0]!;
  return normalizeQueryWhitespace(selected.replace(/\{keywords\}/g, keywords));
}

export function buildTopUpQueries(contract: AgendaContract, bucketId: SourceBucketId): QueryCandidate[] {
  return [0, 1].map((variant): QueryCandidate => ({
    bucketId,
    query: buildTopicAwareTopUpQuery(bucketId, contract, variant),
    source: "top_up",
    strategy: "multi_hop",
    priority: /site:/i.test(buildTopicAwareTopUpQuery(bucketId, contract, variant)) ? "domain_targeted" : "top_up",
  }));
}
