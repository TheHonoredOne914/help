import type { CitationStrength, EvidenceSource, SourceClass } from "./evidence-registry-types.js";

const STRONG_SOURCE_CLASSES = new Set<SourceClass>([
  "court_primary",
  "official_government",
  "parliamentary_records",
  "electoral_body",
]);

export function computeCitationStrength(source: Pick<EvidenceSource, "citationEligible" | "extractionQuality" | "limitedSource" | "sourceClass" | "authorityScore" | "keyFacts">): CitationStrength {
  if (!source.citationEligible || source.extractionQuality === "failed") return "ineligible";
  if (source.extractionQuality === "snippet" || source.limitedSource) return "weak";
  if (
    STRONG_SOURCE_CLASSES.has(source.sourceClass)
    && source.authorityScore >= 80
    && (source.extractionQuality === "full" || source.extractionQuality === "partial")
  ) {
    return "strong";
  }
  if (source.authorityScore >= 65 && hasSubstantiveFacts(source.keyFacts)) return "medium";
  return "weak";
}

export function hasSubstantiveFacts(keyFacts: string[]): boolean {
  return keyFacts.some((fact) => fact.trim().length > 0 && !/^title-only relevance:/i.test(fact.trim()));
}
