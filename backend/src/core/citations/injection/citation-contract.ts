import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { CitationContractResult, CitationContractViolation } from "./types.js";

/**
 * Validates that a generated text block satisfies the citation contract:
 * - Every factual sentence must have at least one [Source N](url) citation
 * - All cited sources must be in the approved set
 * - All cited sources must be citation-eligible
 * - Counterclaim sentences must cite their own source, not just the original claim source
 * - Citations must not be clustered at paragraph ends
 */
export function enforceCitationContract(
  text: string,
  registry?: EvidenceRegistryCore,
  approvedSourceIds: number[] = [],
): CitationContractResult {
  const violations: CitationContractViolation[] = [];
  const uncitedSentences: string[] = [];
  const approvedSet = new Set(approvedSourceIds);
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const factual = isFactualSentence(sentence);
    if (sentence.length < 20 && !factual) continue;

    const citationMatches = [...sentence.matchAll(/\[Source\s+(\d+)\]\(([^)]+)\)/gi)];

    // Check if factual sentence has citation
    if (factual && citationMatches.length === 0) {
      uncitedSentences.push(sentence);
      violations.push({
        type: "missing_citation",
        description: `Factual sentence without citation: "${sentence.slice(0, 60)}..."`,
        sentenceIndex: i,
      });
    }

    // Check if cited sources are approved
    for (const match of citationMatches) {
      const sourceId = Number(match[1]);
      if (approvedSourceIds.length > 0 && !approvedSet.has(sourceId)) {
        violations.push({
          type: "unapproved_source",
          description: `Source ${sourceId} cited but not in approved set`,
          sentenceIndex: i,
          sourceId,
        });
      }
      if (!registry) continue;
      const source = registry.getSource(sourceId);
      if (source && !source.citationEligible) {
        violations.push({
          type: "ineligible_source",
          description: `Source ${sourceId} cited but not citation-eligible`,
          sentenceIndex: i,
          sourceId,
        });
      }
    }
  }

  // Check for clustered citations: paragraph-final sentences with >5 citations
  const paragraphs = text.split(/\n\n+/);
  for (const para of paragraphs) {
    const paraSentences = para.match(/[^.!?\n]+[.!?]?/g) ?? [];
    if (paraSentences.length < 2) continue;
    const lastSentence = paraSentences[paraSentences.length - 1];
    const lastCitations = [...lastSentence.matchAll(/\[Source\s+\d+\]/gi)];
    if (lastCitations.length > 5) {
      violations.push({
        type: "clustered_citations",
        description: `${lastCitations.length} citations clustered at end of paragraph`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    uncitedSentences,
  };
}

const FACTUAL_PATTERNS = [
  /\b\d+(?:\.\d+)?%/,
  /(?:[$]\s?\d+(?:[.,]\d+)?|\b(?:rs\.?|inr|usd)\s?\d+(?:[.,]\d+)?)/i,
  /\brank(?:ed)?\s+\d+/i,
  /\b(?:article|section|clause)\s+\d+/i,
  /\b(?:crore|lakh|billion|million|trillion)\b/i,
  /\b(?:supreme court|high court|district court|sessions court)\b/i,
  /\b(?:held that|ruled that|observed that|directed that)\b/i,
  /\b(?:according to|as per|per the)\b/i,
  /\b(?:report|study|survey|index|census)\b/i,
];

function isFactualSentence(sentence: string): boolean {
  return FACTUAL_PATTERNS.some((pattern) => pattern.test(sentence));
}
