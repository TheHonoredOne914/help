import type { EvidenceRegistryCore } from "./evidence-registry.js";
import type { EvidenceSource } from "./evidence-registry-types.js";

export interface RankedEvidenceTier {
  strong: EvidenceSource[];
  medium: EvidenceSource[];
  weak: EvidenceSource[];
  ineligible: EvidenceSource[];
}

export function rankEvidenceByTier(registry: EvidenceRegistryCore): RankedEvidenceTier {
  return {
    strong: sortTier(registry.getStrongSources()),
    medium: sortTier(registry.getMediumSources()),
    weak: sortTier(registry.getWeakSources()),
    ineligible: sortTier(registry.getIneligibleSources()),
  };
}

export function getTopNForPrompt(registry: EvidenceRegistryCore, n: number): EvidenceSource[] {
  const tiers = rankEvidenceByTier(registry);
  return [...tiers.strong, ...tiers.medium, ...tiers.weak].slice(0, Math.max(0, n));
}

function sortTier(sources: EvidenceSource[]): EvidenceSource[] {
  return [...sources].sort((a, b) => b.authorityScore - a.authorityScore || b.keyFacts.length - a.keyFacts.length || a.id - b.id);
}
