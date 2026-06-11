import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { SourceBucketId } from "../../retrieval/source-buckets.js";
import type { EvidenceRegistryCore } from "../evidence-registry.js";
import { applyDomainDiversity } from "./domain-diversity.js";
import { toEvidenceCard } from "./evidence-card-adapter.js";
import { namedPackLimit } from "./pack-budget.js";
import { rankEvidenceCards } from "./pack-ranking.js";
import type { EvidenceCard, EvidencePack, EvidencePackBuildOptions } from "./types.js";

export function buildEvidencePacks(registry: EvidenceRegistryCore, contract: AgendaContract, options: EvidencePackBuildOptions = {}): Record<string, EvidencePack> {
  const query = options.query ?? contract.normalizedAgenda ?? contract.originalUserQuery;
  const mode = options.mode;
  const cards = registry.getCitationEligibleSources().map((source) => toEvidenceCard(source, registry, query));
  const required = contract.requiredSourceBuckets.map((bucket) => bucket.bucketId as SourceBucketId);
  const limit = namedPackLimit(mode, options.maxCardsPerPack);
  const make = (id: string, buckets: SourceBucketId[], fallback = false): EvidencePack => {
    const candidates = cards.filter((card) => card.bucketIds.some((bucketId) => buckets.includes(bucketId)));
    const selected = selectCards(candidates.length || !fallback ? candidates : cards, query, limit);
    return {
      id,
      cards: selected,
      limitations: packLimitations(registry, contract, selected, buckets),
    };
  };

  return {
    democracyScorePack: make("democracyScorePack", ["democracy_index", "comparative_democracy"]),
    repressionPack: make("repressionPack", ["government_official", "human_rights_watchdog", "civic_space", "digital_rights"]),
    humanRightsPack: make("humanRightsPack", ["human_rights_watchdog", "civic_space", "press_freedom"]),
    judicialPack: make("judicialPack", ["court_legal", "legal_commentary", "parliamentary_records"]),
    electoralIntegrityPack: make("electoralIntegrityPack", ["electoral_integrity", "government_official", "court_legal"]),
    comparativePack: make("comparativePack", ["comparative_democracy", "democracy_index"]),
    governmentCounterNarrativePack: make("governmentCounterNarrativePack", ["government_official", "parliamentary_records"]),
    academicAnalysisPack: make("academicAnalysisPack", ["academic_research", "policy_research"]),
    pressFreedomPack: make("pressFreedomPack", ["press_freedom", "indian_major_media"]),
    debateUtilityPack: make("debateUtilityPack", ["indian_major_media", "parliamentary_records", "policy_research", "court_legal"], true),
    strategicSynthesisPack: buildStrategicSynthesisPack(cards, query, limit, required, registry, contract),
  };
}

function buildStrategicSynthesisPack(
  cards: EvidenceCard[],
  query: string,
  limit: number,
  requiredBuckets: SourceBucketId[],
  registry: EvidenceRegistryCore,
  contract: AgendaContract,
): EvidencePack {
  const strong = cards.filter((card) => card.citationStrength === "strong" || card.citationStrength === "medium");
  const limited = cards.filter((card) => card.limitedSource || card.limitations.length > 0);
  const requiredRepresentatives = requiredBuckets
    .map((bucketId) => rankEvidenceCards(cards.filter((card) => card.bucketIds.includes(bucketId)), { query })[0])
    .filter((card): card is EvidenceCard => Boolean(card));
  const selected = selectCards([...requiredRepresentatives, ...strong, ...limited], query, limit);
  return {
    id: "strategicSynthesisPack",
    cards: selected,
    limitations: packLimitations(registry, contract, selected, requiredBuckets),
  };
}

function selectCards(cards: EvidenceCard[], query: string, limit: number): EvidenceCard[] {
  return applyDomainDiversity(rankEvidenceCards(cards, { query }), {
    limit,
    earlyWindow: Math.min(12, limit),
    maxPerDomainEarly: 3,
    maxPerDomain: 4,
  });
}

function packLimitations(registry: EvidenceRegistryCore, contract: AgendaContract, selected: EvidenceCard[], buckets: SourceBucketId[]): string[] {
  const limitations: string[] = [];
  if (registry.getCitationEligibleCount() < contract.minimumUniqueCitedSources) {
    limitations.push(`Only ${registry.getCitationEligibleCount()} citation-eligible sources available.`);
  }
  const missingBuckets = buckets.filter((bucketId) => !selected.some((card) => card.bucketIds.includes(bucketId)));
  if (missingBuckets.length > 0) limitations.push(`No selected evidence for buckets: ${missingBuckets.join(", ")}.`);
  return limitations;
}
