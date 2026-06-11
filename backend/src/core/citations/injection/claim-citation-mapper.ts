import type { ClaimLedger, ClaimLedgerItem } from "../../evidence/claim-ledger.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";

/**
 * Maps claims from the ClaimLedger to their supporting source IDs,
 * grouped by the section they support. Only returns citation-credit-eligible items.
 */
export function buildClaimCitationMap(
  ledger: ClaimLedger,
  registry: EvidenceRegistryCore,
): Map<string, number[]> {
  const sectionMap = new Map<string, Set<number>>();

  for (const item of ledger.items) {
    if (!item.citationCreditEligible) continue;

    const source = registry.getSource(item.sourceId);
    if (!source || !source.citationEligible) continue;

    const section = item.supportedSection ?? "unspecified";
    if (!sectionMap.has(section)) {
      sectionMap.set(section, new Set());
    }
    sectionMap.get(section)!.add(item.sourceId);
  }

  const result = new Map<string, number[]>();
  for (const [section, ids] of sectionMap.entries()) {
    result.set(section, [...ids]);
  }
  return result;
}

export function resolveCitationsForClaims(
  ledger: ClaimLedger,
  approvedSourceIds: number[],
): ClaimLedgerItem[] {
  const approved = new Set(approvedSourceIds);
  return ledger.items.filter((item) => item.citationCreditEligible && approved.has(item.sourceId));
}

/**
 * Finds the best source IDs for a given claim text by looking up
 * the ClaimLedger for matching claims and returning their source IDs,
 * sorted by confidence.
 */
export function findSourcesForClaimText(
  claimText: string,
  ledger: ClaimLedger,
  registry: EvidenceRegistryCore,
): number[] {
  const claimLower = claimText.toLowerCase();
  const tokens = importantTokens(claimLower);

  const scored: Array<{ item: ClaimLedgerItem; score: number }> = [];

  for (const item of ledger.items) {
    if (!item.citationCreditEligible) continue;

    const source = registry.getSource(item.sourceId);
    if (!source || !source.citationEligible) continue;

    const itemText = (item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? "").toLowerCase();
    const itemTokens = importantTokens(itemText);

    let score = 0;
    for (const token of tokens) {
      if (itemTokens.has(token)) score += 1;
    }
    if (score === 0) continue;

    // Boost by confidence
    const confBoost: Record<string, number> = { high: 3, medium: 2, low: 1 };
    score += confBoost[item.confidence] ?? 0;

    scored.push({ item, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item.sourceId)
    .filter((id, index, arr) => arr.indexOf(id) === index); // dedupe
}

function importantTokens(text: string): Set<string> {
  return new Set(
    text
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !["source", "this", "that", "with", "from", "into"].includes(token)),
  );
}
