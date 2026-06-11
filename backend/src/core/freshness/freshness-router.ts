import type { ResearchMode } from "../config/research-mode.js";

export type FreshnessMode = ResearchMode | "normal" | "rhetorics" | "drafting" | "web_search";

export interface FreshnessRoutingDecision {
  needed: boolean;
  reason: string | null;
  suggestedMode: "fast_research" | "none";
  currentYear: number;
  matchedTerms: string[];
}

const FRESHNESS_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: "explicit current/latest wording", pattern: /\b(current|latest|today|now|recent|live|ongoing|present status|as of now)\b/i },
  { reason: "current office or elected representative", pattern: /\bcurrent\s+(?:cm|pm|minister|mp|mla|party|position|status|portfolio|government)\b/i },
  { reason: "current political affiliation", pattern: /\b(?:current|latest)\s+(?:party|alliance|coalition|position)\b/i },
  { reason: "conflict or geopolitical status", pattern: /\b(?:war status|ceasefire|border status|geopolitical|current affairs|live conflict|ongoing conflict|lac status)\b/i },
  { reason: "election result freshness", pattern: /\b(?:election result|poll result|mandate|seat tally|current government)\b/i },
  { reason: "recent legal or legislative development", pattern: /\b(?:latest judgment|latest judgement|recent judgment|recent judgement|recent bill|new bill|ordinance|notification)\b/i },
  { reason: "recent public order event", pattern: /\b(?:recent protest|ongoing protest|violence today|public order situation)\b/i },
  { reason: "modern explicit year", pattern: /\b202[4-9]\b/i },
];

export function detectFreshnessNeeded(query: string, mode: FreshnessMode): FreshnessRoutingDecision {
  const normalized = query.replace(/\s+/g, " ").trim();
  const matched = FRESHNESS_PATTERNS
    .filter((item) => item.pattern.test(normalized))
    .map((item) => item.reason);
  const freshnessEligibleMode = mode === "normal" || mode === "rhetorics" || mode === "drafting" || mode === "web_search" || mode === "fast_research";
  const staticLegalExplainer = /\b(explain|what is|define|meaning of|doctrine)\b/i.test(normalized)
    && /\barticle\s+\d+|basic structure|proportionality doctrine\b/i.test(normalized)
    && !/\b(current|latest|recent|today|202[4-9]|new bill|judgment|result|status)\b/i.test(normalized);

  if (!freshnessEligibleMode || staticLegalExplainer || matched.length === 0) {
    return {
      needed: false,
      reason: null,
      suggestedMode: "none",
      currentYear: new Date().getFullYear(),
      matchedTerms: [],
    };
  }

  return {
    needed: true,
    reason: matched[0],
    suggestedMode: "fast_research",
    currentYear: new Date().getFullYear(),
    matchedTerms: [...new Set(matched)],
  };
}

export function queryNeedsCurrentYearBias(query: string): boolean {
  return detectFreshnessNeeded(query, "normal").needed && !/\b20\d{2}\b/.test(query);
}
