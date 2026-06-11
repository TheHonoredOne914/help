import type { SourceBucketId } from "../../retrieval/source-buckets.js";
import type { EvidenceCard } from "./types.js";
import { applyDomainDiversity } from "./domain-diversity.js";
import { rankEvidenceCards } from "./pack-ranking.js";

interface SectionSelectionOptions {
  query?: string;
  limit?: number;
}

const SECTION_BUCKETS: Array<{ pattern: RegExp; buckets: SourceBucketId[]; weak?: boolean }> = [
  { pattern: /source reliability|methodology/i, buckets: ["government_official", "court_legal", "parliamentary_records", "policy_research", "academic_research"] },
  { pattern: /evidence gaps?|limitations?/i, buckets: ["human_rights_watchdog", "civic_space", "digital_rights", "press_freedom", "indian_major_media"], weak: true },
  { pattern: /legal|constitutional|supreme court|judicial/i, buckets: ["court_legal", "legal_commentary", "parliamentary_records"] },
  { pattern: /strategic synthesis|debate utility|floor strategy/i, buckets: ["government_official", "parliamentary_records", "court_legal", "policy_research", "indian_major_media"] },
];

export function selectSectionEvidence(sectionName: string, cards: EvidenceCard[], options: SectionSelectionOptions = {}): EvidenceCard[] {
  const mapping = SECTION_BUCKETS.find((item) => item.pattern.test(sectionName));
  const candidates = mapping
    ? cards.filter((card) => card.bucketIds.some((bucketId) => mapping.buckets.includes(bucketId)) || (mapping.weak && (card.limitedSource || card.citationStrength === "weak")))
    : cards;
  const weakFirst = mapping?.weak
    ? [...candidates].sort((a, b) => Number(b.limitedSource || b.citationStrength === "weak") - Number(a.limitedSource || a.citationStrength === "weak") || a.sourceId - b.sourceId)
    : rankEvidenceCards(candidates, { query: options.query });
  return applyDomainDiversity(weakFirst, { limit: options.limit ?? 6, maxPerDomainEarly: 2, maxPerDomain: 3 });
}
