/**
 * Brick 18 — Claim context builder.
 *
 * Builds per-division claim context from ClaimGraph, respecting
 * per-division claim caps (B18-29) and semantic selection (B18-33).
 */

import { selectDivisionClaims, buildDivisionClaimGap, type EvidenceClaim, type ClaimGraph } from "../../evidence/claim-graph.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { CanonicalDivisionId } from "./types.js";

/** Per-division claim caps (B18-29 fix: not universal 6). */
const DIVISION_CLAIM_CAPS: Record<CanonicalDivisionId, number> = {
  core_brief: 5,
  analytical_dimensions: 8,
  stakeholder_mapping: 6,
  conflict_mapping: 6,
  narrative_analysis: 5,
  evidence_verification: 10,
  debate_utility: 10,
  policy_pathways: 6,
  predictive_analysis: 5,
  resolution_support: 5,
  strategic_insights: 8,
};

export interface DivisionClaimContext {
  claims: EvidenceClaim[];
  gapMessage: string | null;
  claimCount: number;
  formatted: string;
}

/**
 * Select claims for a division from ClaimGraph.
 * Returns the selected claims plus a formatted context block.
 */
export function buildClaimContextForDivision(
  graph: ClaimGraph,
  divisionId: CanonicalDivisionId,
  divisionName: string,
  registry: EvidenceRegistryCore,
): DivisionClaimContext {
  const cap = DIVISION_CLAIM_CAPS[divisionId] ?? 6;
  const claims = selectDivisionClaims(graph, divisionId, divisionName, cap);

  if (claims.length === 0) {
    const gap = buildDivisionClaimGap(divisionName);
    return {
      claims: [],
      gapMessage: gap,
      claimCount: 0,
      formatted: gap,
    };
  }

  const lines = claims.map((claim, index) => {
    // BUG-19-07 FIX: Cite all eligible supporting sources, not just [0]
    const citations = claim.supportingSourceIds
      .map((id) => registry.getSource(id))
      .filter((s) => s?.citationEligible)
      .slice(0, 3)
      .map((s) => registry.getCitationMarkdown(s!.id))
      .filter(Boolean)
      .join(" ");
    const qualify = claim.confidence === "low" || claim.mustUseCarefulLanguage
      ? " (qualify carefully; use as context unless corroborated)"
      : "";
    return `${index + 1}. ${claim.text} ${citations}${qualify}`;
  });

  return {
    claims,
    gapMessage: null,
    claimCount: claims.length,
    formatted: lines.join("\n"),
  };
}

/** Get the claim cap for a division. */
export function getClaimCapForDivision(divisionId: CanonicalDivisionId): number {
  return DIVISION_CLAIM_CAPS[divisionId] ?? 6;
}
