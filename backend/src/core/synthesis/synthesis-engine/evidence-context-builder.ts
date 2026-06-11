/**
 * Brick 18 — Evidence context builder.
 *
 * B18-42: Final prompt source universe includes full registry, not just evidencePacks.
 * B18-48: Multi-source corroboration in synthesis — uses all supporting sources, not just [0].
 */

import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { EvidencePack } from "../../evidence/evidence-pack-builder.js";
import type { ClaimLedger } from "../../evidence/claim-ledger.js";

export interface EvidenceContext {
  /** Full source universe including registry sources not in packs. */
  sourceIds: number[];
  /** Sources from packs. */
  packSourceIds: number[];
  /** Additional registry sources not in packs. */
  registryOnlySourceIds: number[];
  /** Count of citation-eligible sources across full universe. */
  citationEligibleCount: number;
}

/**
 * Build the full evidence context including registry sources beyond packs.
 * B18-42: Ensures the final prompt can reference the full registry.
 */
export function buildEvidenceContext(
  registry: EvidenceRegistryCore,
  evidencePacks: EvidencePack[],
): EvidenceContext {
  const packSourceIds = new Set<number>();
  for (const pack of evidencePacks) {
    for (const card of pack.cards) {
      packSourceIds.add(card.sourceId);
    }
  }

  const allSourceIds = registry.getCitationEligibleSources().map((s) => s.id);
  const registryOnlySourceIds = allSourceIds.filter((id) => !packSourceIds.has(id));

  return {
    sourceIds: allSourceIds,
    packSourceIds: [...packSourceIds],
    registryOnlySourceIds,
    citationEligibleCount: allSourceIds.length,
  };
}

/**
 * B18-48: Get all supporting sources for a claim, not just [0].
 * Returns citation markdown for multi-source corroboration.
 */
export function getCorroboratingCitations(
  sourceIds: number[],
  registry: EvidenceRegistryCore,
  limit = 3,
): string {
  return sourceIds
    .slice(0, limit)
    .map((id) => registry.getCitationMarkdown(id))
    .filter(Boolean)
    .join(" ");
}
