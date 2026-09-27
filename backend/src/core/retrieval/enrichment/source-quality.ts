import type { EnrichmentEvidenceCard, CleanedText, EnrichedSource } from "./types.js";

export interface CitationEligibility {
  citationEligible: boolean;
  citationStrength: EnrichmentEvidenceCard["citationStrength"];
}

export function extractionQualityFor(cleaned: CleanedText, method: EnrichedSource["extractionMethod"]): EnrichedSource["extractionQuality"] {
  if (!cleaned.text.trim()) return "low";
  if (isEvidenceShell(cleaned.text)) return "low";
  if (method === "snippet_fallback") {
    // Search snippets are often 12–40 words; keep a modest floor so weak citations remain possible.
    return cleaned.wordCount >= 12 && cleaned.uniqueWordRatio >= 0.32 && cleaned.boilerplateRatio < 0.4 ? "medium" : "low";
  }
  if (cleaned.wordCount >= 80 && cleaned.uniqueWordRatio >= 0.22 && cleaned.boilerplateRatio <= 0.25) return "high";
  if (cleaned.wordCount >= 5 && cleaned.uniqueWordRatio >= 0.2 && cleaned.boilerplateRatio <= 0.55) return "medium";
  return "low";
}

export function isLimitedSource(source: Pick<EnrichedSource, "extractionMethod" | "fallbackExtractionUsed">): boolean {
  return source.extractionMethod === "snippet_fallback" || Boolean(source.fallbackExtractionUsed);
}

/** Align limited-source gate with BM25 chunk floor (see local-relevance-scorer). */
const LIMITED_RELEVANCE_FLOOR = 0.35;

export function computeCitationEligibility(card: EnrichmentEvidenceCard): CitationEligibility {
  const keyTermHits = card.keyTermsMatched?.length ?? 0;
  const limitedTooWeak = card.limitedSource === true
    && card.relevanceScore < LIMITED_RELEVANCE_FLOOR
    && keyTermHits < 1;
  const ineligible = card.extractionQuality === "low"
    || limitedTooWeak
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

/** Letterhead / chrome patterns only count as shells when the extract is short. */
const SHELL_LETTERHEAD_MAX_CHARS = 520;

export function isEvidenceShell(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  // Hard shells: bot/JS gates and dead pages at any length.
  if (/\byou need to enable javascript to run this app\b/i.test(normalized)) return true;
  if (/\bjavascript must be enabled in order for you to use the site\b/i.test(normalized)) return true;
  if (/\benable javascript to continue\b/i.test(normalized)) return true;
  if (/\bplease enable javascript\b/i.test(normalized)) return true;
  if (/\booops?!+.*\bpage you are looking for is not found\b.*\bback to home\b/i.test(normalized)) return true;
  if (/\bpage you are looking for is not found\b.*\bElection Commission of India\b/i.test(normalized)) return true;

  // Substantial extracts: keep real judgments, parliamentary Q&A, and news that
  // happen to mention "privacy policy" / court captions. Prior unbounded matches
  // marked those full texts as shells → isUsable rejected them → snippet_fallback.
  if (normalized.length >= SHELL_LETTERHEAD_MAX_CHARS) return false;

  if (/cookie|subscribe|advertisement|privacy policy|terms of use|share this|navigation|skip to content|all rights reserved/i.test(normalized)) return true;
  if (/Decrease Font Size|Increase Font Size|Normal Theme|Sitemap|Advance Search/i.test(normalized)) return true;
  if (/LOK SABHA|RAJYA SABHA|UNSTARRED QUESTION|STARRED QUESTION|Will the Minister of|TO BE ANSWERED ON|STATES CITIES SPORTS|Image used for representative/i.test(normalized)) return true;
  if (/IN THE SUPREME COURT OF INDIA|IN THE HIGH COURT OF|WRIT PETITION|CIVIL APPELLATE JURISDICTION|CIVIL ORIGINAL JURISDICTION|SPECIAL LEAVE PETITION|REPORTABLE|NON-REPORTABLE|URL Source:|Markdown Content:/i.test(normalized)) return true;
  if (/External link confirmation|img Essay Series|\bA2A\b|json LICENSE|Share\]\(\s*\*\*|Browse by Topics|Progammes & Centres/i.test(normalized)) return true;
  if (/^[A-Z0-9 ,.\-/()]{40,}$/.test(normalized) && /MINISTRY OF|GOVERNMENT OF INDIA/.test(normalized)) return true;
  return false;
}
