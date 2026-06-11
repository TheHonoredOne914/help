import type { EvidenceSource } from "../evidence-registry.js";
import { findEvidenceSpanForText, importantTokens, isBoilerplateText, sharedImportantTokens } from "./evidence-span-matcher.js";
import type { GroundingResult, SourceUsageMapItem } from "./types.js";

export function groundUsageItem(item: SourceUsageMapItem, source: EvidenceSource): GroundingResult {
  const claimText = extractGroundingText(item);
  if (!claimText) {
    return { grounded: false, claimText: "", sharedTokens: [], reason: "No claim-bearing field was provided." };
  }
  if (isBoilerplateText(claimText)) {
    return { grounded: false, claimText, sharedTokens: [], reason: "Claim text is boilerplate." };
  }
  const evidenceSpan = findEvidenceSpanForText(claimText, source);
  if (evidenceSpan) {
    return { grounded: true, claimText, sharedTokens: evidenceSpan.sharedTokens, evidenceSpan };
  }
  const claimTokens = importantTokens(claimText);
  const sourceTokens = importantTokens([
    ...source.topChunks.map((chunk) => chunk.text),
    ...source.keyFacts,
    ...source.legalHoldings,
    ...source.keyNumbers,
    source.fullText,
    source.snippet,
  ].filter(Boolean).join(" "));
  const sharedTokens = sharedImportantTokens(claimTokens, sourceTokens);
  return {
    grounded: sharedTokens.length >= 3,
    claimText,
    sharedTokens,
    reason: sharedTokens.length >= 3 ? undefined : "Claim is not grounded by sufficient token overlap.",
  };
}

export function extractGroundingText(item: SourceUsageMapItem): string {
  switch (item.usageType) {
    case "number_extracted":
      return [item.extractedNumber, item.extractedClaim, item.supportedSection].filter(Boolean).join(" ");
    case "legal_holding_extracted":
      return item.legalHolding?.trim() ?? "";
    case "limitation_identified":
    case "used_for_reliability_matrix":
    case "used_for_citation_audit":
    case "relevant_but_weak":
      return item.limitation?.trim() ?? "";
    case "used_for_debate_utility":
      return [item.extractedClaim, item.supportedSection].filter(Boolean).join(" ");
    case "supports_claim":
    case "challenges_claim":
    case "fact_extracted":
      return [item.extractedClaim, item.supportedSection].filter(Boolean).join(" ");
    default:
      return "";
  }
}
