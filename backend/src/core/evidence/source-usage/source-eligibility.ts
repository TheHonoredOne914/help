import type { EvidenceSource } from "../evidence-registry.js";
import type { SourceUsageMapItem, SourceUsageType, StructuredSourceUsageFailure } from "./types.js";
import { sourceUsageFailure } from "./failure-reporting.js";

export const VALID_USAGE_TYPES: SourceUsageType[] = [
  "fact_extracted",
  "number_extracted",
  "legal_holding_extracted",
  "limitation_identified",
  "supports_claim",
  "challenges_claim",
  "used_for_reliability_matrix",
  "used_for_debate_utility",
  "used_for_citation_audit",
  "relevant_but_weak",
];

export const COUNTING_USAGE_TYPES = new Set<SourceUsageType>([
  "fact_extracted",
  "number_extracted",
  "legal_holding_extracted",
  "limitation_identified",
  "supports_claim",
  "challenges_claim",
  "used_for_reliability_matrix",
  "used_for_debate_utility",
  "used_for_citation_audit",
]);

export function sourceUsageRequirementSatisfied(sourceCount: number, minimum = 30): boolean {
  return sourceCount >= minimum;
}

export function isTitleOnlySource(source: EvidenceSource): boolean {
  return source.keyFacts.length > 0 && source.keyFacts.every((fact) => /^title-only relevance:/i.test(fact.trim()));
}

export function hasClaimContent(item: SourceUsageMapItem): boolean {
  return [item.extractedClaim, item.extractedNumber, item.legalHolding, item.limitation, item.supportedSection]
    .some((value) => Boolean(value?.trim()));
}

export function sourceEligibilityFailures(roleName: string, item: SourceUsageMapItem, source: EvidenceSource): StructuredSourceUsageFailure[] {
  const failures: StructuredSourceUsageFailure[] = [];
  if (!source.citationEligible) {
    failures.push(sourceUsageFailure("ineligible_source", roleName, `Source ${source.id} is not citation eligible.`, item));
  }
  if (source.extractionQuality === "failed") {
    failures.push(sourceUsageFailure("failed_source", roleName, `Source ${source.id} extraction failed.`, item));
  }
  if (isTitleOnlySource(source) && COUNTING_USAGE_TYPES.has(item.usageType)) {
    failures.push(sourceUsageFailure("title_only_source", roleName, `Source ${source.id} only has title-level relevance.`, item));
  }
  if (item.usageType === "legal_holding_extracted" && !["court_primary", "legal_commentary"].includes(source.sourceClass)) {
    failures.push(sourceUsageFailure("unsupported_legal_holding", roleName, `Source ${source.id} is ${source.sourceClass}, not a legal source class.`, item));
  }
  return failures;
}

export function canCountForStrictSourceUsage(source: EvidenceSource, item: SourceUsageMapItem): boolean {
  if (!COUNTING_USAGE_TYPES.has(item.usageType)) return false;
  if (!source.citationEligible || source.extractionQuality === "failed") return false;
  if (isTitleOnlySource(source)) return false;
  if (source.extractionQuality === "snippet") return false;
  if (source.limitedSource && !hasLegacyPartialEvidence(source)) return false;
  return source.citationStrength === "strong" || source.citationStrength === "medium" || hasLegacyPartialEvidence(source);
}

export function weakSourceWarning(roleName: string, item: SourceUsageMapItem, source: EvidenceSource): StructuredSourceUsageFailure | null {
  if (!COUNTING_USAGE_TYPES.has(item.usageType)) return null;
  if (source.extractionQuality === "snippet") {
    return sourceUsageFailure("snippet_source_not_counted", roleName, `Source ${source.id} is snippet-only and cannot satisfy strict usage.`, item, "warning");
  }
  if ((source.citationStrength === "weak" || source.limitedSource) && !hasLegacyPartialEvidence(source)) {
    return sourceUsageFailure("weak_source_not_counted", roleName, `Source ${source.id} is weak/limited and cannot satisfy strict usage.`, item, "warning");
  }
  return null;
}

function hasLegacyPartialEvidence(source: EvidenceSource): boolean {
  return (source.extractionQuality === "full" || source.extractionQuality === "partial")
    && Boolean(source.fullText?.trim())
    && source.authorityScore >= 65
    && source.keyFacts.some((fact) => fact.trim() && !/^title-only relevance:/i.test(fact.trim()));
}
