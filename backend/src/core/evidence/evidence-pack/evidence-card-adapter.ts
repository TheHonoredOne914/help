import type { EvidenceRegistryCore, EvidenceSource } from "../evidence-registry.js";
import { buildEvidenceCard } from "../evidence-card-store.js";
import { scoreQueryRelevance } from "./query-relevance-scorer.js";
import { extractEvidenceItems } from "./enrichment-card-adapter.js";
import type { EvidenceCard } from "./types.js";
import { retrievalCacheManager } from "../../retrieval-cache/index.js";

export function toEvidenceCard(source: EvidenceSource, registry: EvidenceRegistryCore, query = ""): EvidenceCard {
  const agendaFingerprint = query || registry.contract.normalizedAgenda;
  const cached = retrievalCacheManager.getEvidenceCard(source, agendaFingerprint);
  if (cached && (source.limitedSource || !cached.limitedSource)) {
    return cached;
  }
  const card = buildEvidenceCard(source, registry);
  const queryRelevanceScore = scoreQueryRelevance(card, query);
  const next = {
    ...card,
    queryRelevanceScore,
    relevanceScore: query ? Math.round(queryRelevanceScore * 0.6 + source.authorityScore * 0.4) : card.relevanceScore,
    enrichmentCard: source.enrichmentCard,
    evidenceItems: extractEvidenceItems(source),
    namedEntities: source.namedEntities ?? [],
  };
  retrievalCacheManager.writeEvidenceCard(source, next, agendaFingerprint);
  return next;
}
