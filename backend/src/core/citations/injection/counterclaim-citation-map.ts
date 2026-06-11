import type { ClaimGraph, ClaimCounterclaim } from "../../evidence/claim-graph/types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { CounterclaimCitationEntry } from "./types.js";

/**
 * BUG-19-15 FIX: Builds a map of counterclaim IDs to their own source IDs,
 * ensuring counterclaims cite their own evidence rather than just the
 * original claim's source.
 *
 * This is critical for parliamentary debate: Opposition counterclaims must
 * stand on their own evidence, not just reference what Treasury Bench cited.
 */
export function buildCounterclaimCitationMap(
  claimGraph: ClaimGraph,
  registry: EvidenceRegistryCore,
): CounterclaimCitationEntry[] {
  const counterclaims = claimGraph.counterclaims ?? [];
  const entries: CounterclaimCitationEntry[] = [];

  for (const cc of counterclaims) {
    // Validate that the counterclaim's own sources exist and are citation-eligible
    const validCounterclaimSourceIds = cc.sourceIds.filter((id) => {
      const source = registry.getSource(id);
      return source && source.citationEligible;
    });

    // Find the original claim's source IDs
    let originalClaimSourceIds: number[] = [];
    if (cc.challengedClaimId) {
      const originalClaim = claimGraph.claims.find((c) => c.id === cc.challengedClaimId);
      if (originalClaim) {
        originalClaimSourceIds = originalClaim.supportingSourceIds.filter((id) => {
          const source = registry.getSource(id);
          return source && source.citationEligible;
        });
      }
    }

    entries.push({
      counterclaimId: cc.id,
      counterclaimText: cc.text,
      challengedClaimId: cc.challengedClaimId,
      counterclaimSourceIds: validCounterclaimSourceIds,
      originalClaimSourceIds,
    });
  }

  return entries;
}

/**
 * Returns the citation markdown for a specific counterclaim,
 * using the counterclaim's own sources (never the original claim's).
 */
export function getCounterclaimCitationMarkdown(
  counterclaimId: string,
  entries: CounterclaimCitationEntry[],
  registry: EvidenceRegistryCore,
): string {
  const entry = entries.find((e) => e.counterclaimId === counterclaimId);
  if (!entry) return "";

  return entry.counterclaimSourceIds
    .map((id) => registry.getCitationMarkdown(id))
    .filter(Boolean)
    .join(" ");
}

/**
 * Validates that no counterclaim is cited using only the original claim's sources.
 * Returns entries where counterclaim sources are missing or overlap entirely with original.
 */
export function findCounterclaimCitationViolations(
  entries: CounterclaimCitationEntry[],
): CounterclaimCitationEntry[] {
  return entries.filter((entry) => {
    if (entry.counterclaimSourceIds.length === 0) return true;
    // All counterclaim sources overlap with original — no independent evidence
    const originalSet = new Set(entry.originalClaimSourceIds);
    return entry.counterclaimSourceIds.every((id) => originalSet.has(id));
  });
}
