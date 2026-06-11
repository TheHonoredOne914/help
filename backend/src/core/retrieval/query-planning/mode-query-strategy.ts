import { RESEARCH_LIMITS, type ResearchMode } from "../../config/research-mode.js";
import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { SourceBucket } from "../source-buckets.js";
import { compactAgendaSubject, normalizeQueryWhitespace } from "./agenda-keywords.js";
import type { QueryCandidate, QueryPlanStrategy } from "./types.js";

export interface ModeQueryStrategy {
  mode: ResearchMode;
  templateLimitPerBucket: number;
  includeFallback: boolean;
  includeFreshness: boolean;
  includeParliamentary: boolean;
  includeTopUp: boolean;
  includeLlm: boolean;
  includeTimeline: boolean;
  includeCounterargument: boolean;
  includeComparative: boolean;
  maxTotalQueries: number;
  maxResultsPerQuery: number;
}

export function getModeQueryStrategy(mode: ResearchMode): ModeQueryStrategy {
  const limits = RESEARCH_LIMITS[mode];
  switch (mode) {
    case "fast_research":
      return base(mode, limits.maxTotalQueries, 4, 5, {
        includeFallback: true,
        includeFreshness: true,
        includeParliamentary: true,
        includeTopUp: true,
      });
    case "deep_research":
      return base(mode, limits.maxTotalQueries, 4, 5, {
        includeFallback: true,
        includeFreshness: true,
        includeParliamentary: true,
      });
    case "council":
      return base(mode, limits.maxTotalQueries, 6, 6, {
        includeFallback: true,
        includeFreshness: true,
        includeParliamentary: true,
        includeTopUp: true,
        includeTimeline: true,
        includeCounterargument: true,
        includeComparative: true,
      });
  }
}

export function strategyForTemplate(query: string, mode: ResearchMode): QueryPlanStrategy {
  if (mode === "fast_research") return "high_confidence";
  if (/site:sci\.gov\.in|site:sansad\.in|site:prsindia\.org|site:pib\.gov\.in/i.test(query)) return "primary_source";
  return "baseline";
}

export function buildModeSpecificQueries(contract: AgendaContract, mode: ResearchMode, bucket: SourceBucket): QueryCandidate[] {
  const subject = compactAgendaSubject(contract);
  const bucketAngle = angleForBucket(bucket);
  const currentYear = contract.temporalScope.endYear ?? new Date().getFullYear();
  const previousYear = currentYear - 1;
  const expectedDomains = bucket.preferredDomains;
  const domainPrefix = bucket.preferredDomains[0] ? `site:${bucket.preferredDomains[0]}` : "";
  const candidates = mode === "fast_research"
    ? [
        candidate(`${subject} India policy overview ${bucketAngle}`, "high_confidence"),
        domainPrefix ? candidate(`${domainPrefix} ${subject} India ${bucketAngle}`, "primary_source") : null,
        bucket.id === "parliamentary_records" ? candidate(`${subject} India Parliament PRS brief`, "primary_source") : null,
      ]
    : mode === "deep_research"
      ? [
          candidate(`${subject} recent developments India ${bucketAngle}`, "angle", "current_developments"),
          candidate(`${subject} key arguments India ${bucketAngle}`, "angle"),
          domainPrefix ? candidate(`${domainPrefix} ${subject} India primary source`, "primary_source") : null,
        ]
      : [
          candidate(`${subject} Treasury Bench Opposition legal economic social arguments India ${bucketAngle}`, "counterargument"),
          candidate(`${subject} council deliberation evidence India ${currentYear} ${bucketAngle}`, "multi_hop", "current_year"),
          candidate(`${subject} parliamentary debate committee recommendation India ${bucketAngle}`, "angle"),
          domainPrefix ? candidate(`${domainPrefix} ${subject} India council evidence`, "primary_source") : null,
        ];

  return candidates.filter((item): item is QueryCandidate => Boolean(item));

  function candidate(query: string, strategy: QueryPlanStrategy, freshnessTag?: string): QueryCandidate {
    return {
      bucketId: bucket.id,
      query: normalizeQueryWhitespace(query),
      expectedDomains,
      priority: /\bsite:|\.org|\.in|\.com/i.test(query) ? "domain_targeted" : "broad_discovery",
      source: "static",
      strategy,
      freshnessTags: freshnessTag ? [freshnessTag] : undefined,
    };
  }
}

function base(
  mode: ResearchMode,
  maxTotalQueries: number,
  templateLimitPerBucket: number,
  maxResultsPerQuery: number,
  overrides: Partial<ModeQueryStrategy>,
): ModeQueryStrategy {
  return {
    mode,
    maxTotalQueries,
    templateLimitPerBucket,
    maxResultsPerQuery,
    includeFallback: false,
    includeFreshness: false,
    includeParliamentary: false,
    includeTopUp: false,
    includeLlm: false,
    includeTimeline: false,
    includeCounterargument: false,
    includeComparative: false,
    ...overrides,
  };
}

function angleForBucket(bucket: SourceBucket): string {
  switch (bucket.id) {
    case "government_official":
      return "government notification ministry report";
    case "parliamentary_records":
      return "Lok Sabha Rajya Sabha questions bills committee";
    case "court_legal":
      return "Supreme Court judgment constitutional challenge";
    case "legal_commentary":
      return "legal commentary doctrine case analysis";
    case "policy_research":
      return "policy research implementation evidence";
    case "academic_research":
      return "academic journal working paper";
    case "indian_major_media":
      return "Indian media explained latest";
    case "human_rights_watchdog":
      return "civil society watchdog rights assessment";
    case "democracy_index":
      return "democracy index score methodology";
    case "digital_rights":
      return "digital rights data protection governance";
    case "press_freedom":
      return "press freedom media regulation";
    case "electoral_integrity":
      return "Election Commission electoral integrity";
    case "civic_space":
      return "civic space association protest";
    default:
      return bucket.label.replace(/[^\p{L}\p{N}\s-]/gu, " ");
  }
}
