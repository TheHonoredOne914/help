import type { EnrichmentEvidenceCard, CleanedText, EnrichedSource } from "./types.js";

export interface CitationEligibility {
  citationEligible: boolean;
  citationStrength: EnrichmentEvidenceCard["citationStrength"];
}

export function extractionQualityFor(cleaned: CleanedText, method: EnrichedSource["extractionMethod"]): EnrichedSource["extractionQuality"] {
  if (!cleaned.text.trim()) return "low";
  if (isEvidenceShell(cleaned.text)) return "low";
  if (method === "snippet_fallback") {
    return cleaned.wordCount >= 24 && cleaned.uniqueWordRatio >= 0.32 && cleaned.boilerplateRatio < 0.4 ? "medium" : "low";
  }
  if (cleaned.wordCount >= 80 && cleaned.uniqueWordRatio >= 0.22 && cleaned.boilerplateRatio <= 0.25) return "high";
  if (cleaned.wordCount >= 5 && cleaned.uniqueWordRatio >= 0.2 && cleaned.boilerplateRatio <= 0.55) return "medium";
  return "low";
}

export function isLimitedSource(source: Pick<EnrichedSource, "extractionMethod" | "fallbackExtractionUsed">): boolean {
  return source.extractionMethod === "snippet_fallback" || Boolean(source.fallbackExtractionUsed);
}

export function computeCitationEligibility(card: EnrichmentEvidenceCard): CitationEligibility {
  const ineligible = card.extractionQuality === "low"
    || (card.limitedSource === true && card.relevanceScore < 3)
    || !card.url.trim()
    || card.topChunks.length === 0
    || isEvidenceShell([
      card.title,
      ...card.topChunks,
      ...(card.evidenceItems ?? []).flatMap((item) => [item.claim, item.snippet]),
    ].join("\n"));
  if (ineligible) return { citationEligible: false, citationStrength: "ineligible" };
  if (card.limitedSource) return { citationEligible: true, citationStrength: "weak" };
  if (card.extractionQuality === "high" && card.relevanceScore >= 8) return { citationEligible: true, citationStrength: "strong" };
  if (card.relevanceScore >= 3) return { citationEligible: true, citationStrength: "medium" };
  return { citationEligible: true, citationStrength: "weak" };
}

export function isEvidenceShell(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  return /\byou need to enable javascript to run this app\b/i.test(normalized)
    || /\bjavascript must be enabled in order for you to use the site\b/i.test(normalized)
    || /\booops?!+.*\bpage you are looking for is not found\b.*\bback to home\b/i.test(normalized)
    || /\bpage you are looking for is not found\b.*\bElection Commission of India\b/i.test(normalized);
}
