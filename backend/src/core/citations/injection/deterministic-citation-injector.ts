import type { EvidenceSource } from "../../evidence/evidence-registry-types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";

export function selectCitationsForSection(
  section: string,
  sourceIds: number[],
  registry: EvidenceRegistryCore,
  count = 4
): number[] {
  const sources = sourceIds
    .map((id) => registry.getSource(id))
    .filter((s): s is EvidenceSource => Boolean(s));

  // Match section text against buckets
  const sectionLower = section.toLowerCase();
  
  const relevant = sources.filter(s => 
    s.bucketIds.some(b => sectionLower.includes(b.replace(/_/g, " ")))
  );

  const pool = relevant.length > 0 ? relevant : sources;
  
  // Deterministic pseudo-random sort for fallback to avoid repeating top 4 cards
  const hash = (str: string) => Array.from(str).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0);
  const sectionHash = hash(sectionLower);
  
  return pool
    .sort((a, b) => {
       if (relevant.length > 0) return b.authorityScore - a.authorityScore;
       return (hash(a.id.toString()) ^ sectionHash) - (hash(b.id.toString()) ^ sectionHash);
    })
    .slice(0, count)
    .map(s => s.id);
}
