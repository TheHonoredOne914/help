import type { CitationRepairContext, UnsupportedClaimAction } from "./types.js";
import { isSourceEligibleForCitation } from "./citation-credit-filter.js";

/**
 * Brick 20: Claim-Source Matcher.
 * Matches text claims against actual ClaimGraph and ClaimLedger evidence.
 */
export function findBestSupportingSource(
  claimText: string,
  context: CitationRepairContext
): number | null {
  // 1. Check ClaimGraph for exact or near matches
  const lowerClaim = claimText.toLowerCase();
  for (const claim of context.claimGraph.claims) {
    if (lowerClaim.includes(claim.text.toLowerCase()) || claim.text.toLowerCase().includes(lowerClaim)) {
      // Find the first eligible source ID
      const eligibleSourceId = claim.supportingSourceIds.find(id => isSourceEligibleForCitation(id, context));
      if (eligibleSourceId !== undefined) {
        return eligibleSourceId;
      }
    }
  }

  // 2. Check ClaimLedger
  for (const item of context.claimLedger.items) {
    if (
      (item.extractedClaim && (lowerClaim.includes(item.extractedClaim.toLowerCase()) || item.extractedClaim.toLowerCase().includes(lowerClaim))) ||
      (item.legalHolding && (lowerClaim.includes(item.legalHolding.toLowerCase()) || item.legalHolding.toLowerCase().includes(lowerClaim)))
    ) {
      if (isSourceEligibleForCitation(item.sourceId, context)) {
        return item.sourceId;
      }
    }
  }

  // 3. Check EvidencePacks as fallback (string matching against facts/chunks)
  for (const pack of context.evidencePacks) {
    for (const card of pack.cards) {
      if (!isSourceEligibleForCitation(card.sourceId, context)) continue;

      const factsMatch = card.keyFacts.some(f => f.toLowerCase().includes(lowerClaim) || lowerClaim.includes(f.toLowerCase()));
      const legalMatch = card.legalHoldings.some(l => l.toLowerCase().includes(lowerClaim) || lowerClaim.includes(l.toLowerCase()));
      const chunksMatch = card.topChunks.some(c => c.text.toLowerCase().includes(lowerClaim));

      if (factsMatch || legalMatch || chunksMatch) {
        return card.sourceId;
      }
    }
  }

  return null;
}

/**
 * Determines the action to take for an unsupported claim.
 * BUG-20-22: `qualify`, `remove`, and `source_gap` unsupported-claim actions are computed but ignored.
 */
export function determineUnsupportedClaimAction(
  claimText: string,
  context: CitationRepairContext
): UnsupportedClaimAction {
  // If it's a legal claim (e.g., mentions Article, Section, Court), hard fail if no source
  if (/\b(?:Article|Section|Court|Act|v\.)\b/i.test(claimText)) {
    return "hard_fail";
  }

  // If it's a strong numerical claim or absolute assertion, remove it
  if (/\b(?:\d+%|\d+ crores?|absolutely|proven)\b/i.test(claimText)) {
    return "remove";
  }

  // If it's a broad analytical claim, qualify it
  if (/\b(?:impact|trend|likely|suggests)\b/i.test(claimText)) {
    return "qualify";
  }

  return "source_gap";
}
