import type { EvidenceSource, CitationStrength } from "../../evidence/evidence-registry-types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { SourceQualityAssessment } from "./types.js";

/**
 * Filters and scores sources by quality for citation selection.
 * Returns only sources that meet the minimum quality bar.
 */
export function filterSourcesByQuality(
  sourceIds: number[],
  registry: EvidenceRegistryCore,
  options: {
    minCitationStrength?: CitationStrength;
    requireCitationEligible?: boolean;
    excludeSnippetOnly?: boolean;
  } = {},
): SourceQualityAssessment[] {
  const {
    minCitationStrength = "weak",
    requireCitationEligible = true,
    excludeSnippetOnly = false,
  } = options;

  const strengthRank: Record<CitationStrength, number> = {
    strong: 4,
    medium: 3,
    weak: 2,
    ineligible: 1,
  };
  const minRank = strengthRank[minCitationStrength];

  const assessments: SourceQualityAssessment[] = [];

  for (const id of sourceIds) {
    const source = registry.getSource(id);
    if (!source) continue;

    let eligible = true;
    let reason: string | undefined;

    if (requireCitationEligible && !source.citationEligible) {
      eligible = false;
      reason = "not citation-eligible";
    } else if (strengthRank[source.citationStrength] < minRank) {
      eligible = false;
      reason = `citationStrength ${source.citationStrength} below minimum ${minCitationStrength}`;
    } else if (excludeSnippetOnly && source.extractionQuality === "snippet") {
      eligible = false;
      reason = "snippet-only extraction";
    } else if (source.extractionQuality === "failed") {
      eligible = false;
      reason = "failed extraction";
    }

    assessments.push({
      sourceId: id,
      eligible,
      citationStrength: source.citationStrength,
      sourceClass: source.sourceClass,
      reason,
    });
  }

  return assessments;
}

/**
 * Returns only the IDs of sources that pass quality filtering.
 */
export function getQualityFilteredSourceIds(
  sourceIds: number[],
  registry: EvidenceRegistryCore,
  options?: Parameters<typeof filterSourcesByQuality>[2],
): number[] {
  return filterSourcesByQuality(sourceIds, registry, options)
    .filter((a) => a.eligible)
    .map((a) => a.sourceId);
}
