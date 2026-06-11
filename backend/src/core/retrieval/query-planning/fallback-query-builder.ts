import type { AgendaContract, AgendaLens } from "../../agenda/agenda-contract.js";
import type { SourceBucketId } from "../source-buckets.js";
import { extractAgendaKeywords, normalizeQueryWhitespace } from "./agenda-keywords.js";
import type { QueryCandidate } from "./types.js";

const BUCKET_SUFFIX: Partial<Record<SourceBucketId, string[]>> = {
  government_official: ["site:pib.gov.in India policy", "India government report", "official ministry update"],
  parliamentary_records: ["site:sansad.in parliament question", "site:prsindia.org bill committee", "Lok Sabha Rajya Sabha debate"],
  court_legal: ["site:sci.gov.in Supreme Court judgment", "Supreme Court doctrine India", "constitutional challenge India"],
  legal_commentary: ["Supreme Court Observer analysis", "LiveLaw legal analysis", "Bar and Bench legal analysis"],
  policy_research: ["PRS India policy brief", "NITI Aayog policy paper", "policy research India"],
  academic_research: ["academic research India", "EPW analysis India", "journal article India"],
  indian_major_media: ["The Hindu analysis", "Indian Express explained", "credible Indian media report"],
  human_rights_watchdog: ["civil society report India", "rights watchdog India"],
  civic_space: ["civil society India report", "NGO policy India"],
  democracy_index: ["democracy index India score", "comparative democracy India"],
  digital_rights: ["digital rights India report", "internet freedom India"],
  electoral_integrity: ["Election Commission India", "ADR India electoral reform"],
  press_freedom: ["press freedom India report", "journalist safety India"],
  comparative_democracy: ["comparative policy India", "global index India comparison"],
};

const TOPIC_TERMS: Record<string, string[]> = {
  agriculture_food_policy: ["food security", "PDS", "MSP", "agriculture", "nutrition"],
  technology_data_ai_governance: ["digital governance", "data protection", "platform regulation", "digital commerce"],
  labour_gig_economy: ["gig workers", "platform labour", "social security"],
  health_policy: ["public health", "health ministry", "health policy"],
  education_policy: ["education policy", "UGC", "school education"],
  environment_climate: ["environment", "climate", "pollution", "water security"],
  indian_economic_policy: ["economic policy", "RBI", "budget", "industrial policy"],
  indian_federalism: ["federalism", "centre state", "state autonomy"],
  constitutional_law: ["Article", "Constitution", "Supreme Court"],
  indian_security_policy: ["public order", "national security", "MHA"],
  foreign_policy_india: ["foreign policy", "diplomacy", "India position"],
};

export function buildFallbackQueriesForBucket(contract: AgendaContract, bucketId: SourceBucketId, roleLens?: AgendaLens | string): QueryCandidate[] {
  const keywords = extractAgendaKeywords(contract, 8);
  const topicTerms = TOPIC_TERMS[contract.topicType] ?? [];
  const suffixes = [
    ...(BUCKET_SUFFIX[bucketId] ?? ["India policy research"]),
    ...topicTerms.slice(0, 2).map((term) => `${term} India evidence`),
  ];
  return unique(suffixes).slice(0, 4).map((suffix): QueryCandidate => ({
    bucketId,
    query: normalizeQueryWhitespace(`${keywords} ${suffix}`),
    source: "fallback",
    strategy: "fallback",
    roleLens,
    priority: /site:/i.test(suffix) ? "domain_targeted" : "broad_discovery",
  }));
}

export function buildFallbackQueryTexts(contract: AgendaContract, count = 8): string[] {
  const buckets: SourceBucketId[] = ["government_official", "parliamentary_records", "policy_research", "court_legal", "indian_major_media", "academic_research"];
  return buckets.flatMap((bucketId) => buildFallbackQueriesForBucket(contract, bucketId).map((item) => item.query)).slice(0, count);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
