import type { CitationRepairContext } from "./types.js";
import type { EvidenceSource } from "../../evidence/evidence-registry.js";

/**
 * Brick 20: Citation credit filter.
 * BUG-20-03: repair ignores citationCreditEligible, limitedSource, extractionQuality.
 */
export function isSourceEligibleForCitation(
  sourceId: number,
  context: CitationRepairContext,
  allowLimited = true
): boolean {
  const source = context.registry.getSource(sourceId);
  if (!source) {
    console.log(`[repair] Source ${sourceId} ineligible: not in registry`);
    return false;
  }

  // 1. Must be citationEligible
  if (!source.citationEligible) {
    console.log(`[repair] Source ${sourceId} ineligible: not citationEligible`);
    return false;
  }

  // 2. Must not be snippet/failed extraction quality unless explicitly allowed or it's the only source
  if (source.extractionQuality === "snippet" || source.extractionQuality === "failed") {
    // Check if it's the only source for a highly confident ClaimLedger item
    const ledgerItem = context.claimLedger.items.find(i => i.sourceId === sourceId && i.confidence === "high");
    if (!ledgerItem) {
      console.log(`[repair] Source ${sourceId} ineligible: poor extraction quality (${source.extractionQuality}) and no high confidence ledger item`);
      return false;
    }
  }

  // 3. Must not be limitedSource unless explicitly allowed
  if (source.limitedSource && !allowLimited) {
    console.log(`[repair] Source ${sourceId} ineligible: limitedSource and not allowed`);
    return false;
  }

  // 4. Must not be rejected by ClaimGraph trace validation
  const inClaimGraph = context.claimGraph.claims.some(c => 
    c.supportingSourceIds.includes(sourceId) && 
    !c.sourceTrace?.some(t => t.sourceId === sourceId && t.validationStatus === "rejected")
  );
  
  const inClaimLedger = context.claimLedger.items.some(i => i.sourceId === sourceId);
  const inEvidencePacks = context.evidencePacks.some(p => p.cards.some(c => c.sourceId === sourceId));

  // If it's not in ClaimGraph, ClaimLedger, or EvidencePacks, it shouldn't be cited as primary proof
  if (!inClaimGraph && !inClaimLedger && !inEvidencePacks) {
    console.log(`[repair] Source ${sourceId} ineligible: not in ClaimGraph, ClaimLedger, or EvidencePacks`);
    return false;
  }
  
  // FIX BUG-47: Additional check for explicit citationCreditEligible flag if present on EvidenceSource
  const sourceWithCredit = source as EvidenceSource & { citationCreditEligible?: boolean };
  if (sourceWithCredit.citationCreditEligible === false) {
    console.log(`[repair] Source ${sourceId} ineligible: citationCreditEligible is false`);
    return false;
  }
  
  return true;
}
