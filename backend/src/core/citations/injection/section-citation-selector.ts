import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { ClaimGraph } from "../../evidence/claim-graph/types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { SectionCitationPlan } from "./types.js";
import { buildClaimCitationMap } from "./claim-citation-mapper.js";
import { getQualityFilteredSourceIds } from "./source-quality-filter.js";

/**
 * BUG-19-06 FIX: Selects citations for a given section name using ClaimLedger
 * and ClaimGraph claims, rather than blind bucket matching or offset slicing.
 *
 * Strategy priority:
 * 1. ClaimLedger claim_match — claims whose supportedSection matches this section
 * 2. ClaimGraph bucket_match — claims whose bucketIds overlap with the section
 * 3. authority_fallback — highest-authority sources from the approved set
 * 4. hash_fallback — deterministic pseudo-random from the pool
 */
export function selectCitationsForSectionFromLedger(
  section: string,
  approvedSourceIds: number[],
  registry: EvidenceRegistryCore,
  claimLedger: ClaimLedger,
  claimGraph: ClaimGraph,
  count = 4,
): SectionCitationPlan {
  const qualityIds = getQualityFilteredSourceIds(approvedSourceIds, registry);
  const sectionLower = section.toLowerCase();

  // 1. ClaimLedger match: claims whose supportedSection maps to this section
  const claimMap = buildClaimCitationMap(claimLedger, registry);
  const ledgerMatched = findLedgerMatch(sectionLower, claimMap);
  if (ledgerMatched.length > 0) {
    const filtered = ledgerMatched.filter((id) => qualityIds.includes(id));
    if (filtered.length > 0) {
      return {
        sectionName: section,
        selectedSourceIds: filtered.slice(0, count),
        claimIds: extractClaimIds(claimLedger, filtered),
        strategy: "claim_match",
      };
    }
  }

  // 2. ClaimGraph bucket match: claims with bucketIds that match section keywords
  const graphMatched = findGraphBucketMatch(sectionLower, claimGraph, qualityIds);
  if (graphMatched.length > 0) {
    return {
      sectionName: section,
      selectedSourceIds: graphMatched.slice(0, count),
      claimIds: [],
      strategy: "bucket_match",
    };
  }

  return {
    sectionName: section,
    selectedSourceIds: [],
    claimIds: [],
    strategy: "citation_gap",
    citationGap: true,
  };
}

function findLedgerMatch(sectionLower: string, claimMap: Map<string, number[]>): number[] {
  // Direct match
  for (const [key, ids] of claimMap.entries()) {
    if (sectionLower.includes(key.toLowerCase()) || key.toLowerCase().includes(sectionLower)) {
      return ids;
    }
  }
  // Token overlap match
  const sectionTokens = sectionLower.split(/\s+/).filter((t) => t.length >= 4);
  let bestMatch: number[] = [];
  let bestScore = 0;
  for (const [key, ids] of claimMap.entries()) {
    const keyTokens = key.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
    const score = sectionTokens.filter((t) => keyTokens.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = ids;
    }
  }
  return bestScore >= 2 ? bestMatch : [];
}

function findGraphBucketMatch(sectionLower: string, graph: ClaimGraph, qualityIds: number[]): number[] {
  const qualitySet = new Set(qualityIds);
  const matched = new Set<number>();

  for (const claim of graph.claims) {
    if ((claim.supportScore ?? 0) < 40) continue;
    if (claim.validationStatus === "rejected") continue;

    const buckets = claim.bucketIds ?? [];
    const hasBucketMatch = buckets.some((b) => sectionLower.includes(b.replace(/_/g, " ")));
    if (!hasBucketMatch) continue;

    for (const sourceId of claim.supportingSourceIds) {
      if (qualitySet.has(sourceId)) matched.add(sourceId);
    }
  }

  return [...matched];
}

function extractClaimIds(ledger: ClaimLedger, sourceIds: number[]): string[] {
  const idSet = new Set(sourceIds);
  return ledger.items
    .filter((item) => idSet.has(item.sourceId) && item.citationCreditEligible)
    .map((item) => item.claimId);
}
