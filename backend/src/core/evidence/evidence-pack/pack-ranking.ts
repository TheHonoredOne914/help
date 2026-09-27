import { citationStrengthBonus, sourceClassBaseBonus } from "./citation-strength-ranker.js";
import { dedupeEvidenceCards } from "./pack-deduper.js";
import { scoreQueryRelevance } from "./query-relevance-scorer.js";
import { scoreCardForRole } from "./role-pack-strategy.js";
import { CHUNK_BM25_FLOOR } from "../../retrieval/enrichment/local-relevance-scorer.js";
import type { EvidenceCard, RankEvidenceOptions } from "./types.js";

export function rankEvidenceCards(cards: EvidenceCard[], options: RankEvidenceOptions = {}): EvidenceCard[] {
  const query = options.query ?? "";
  const ranked = dedupeEvidenceCards(cards).flatMap((card) => {
    const bestChunkBm25 = Math.max(0, ...card.topChunks.map((chunk) => chunk.score ?? 0));
    // Drop cards whose best BM25 is positive-but-below floor (weak matched chunks).
    if (bestChunkBm25 > 0 && bestChunkBm25 < CHUNK_BM25_FLOOR) return [];
    const flooredChunks = card.topChunks.filter((chunk) => (chunk.score ?? 0) >= CHUNK_BM25_FLOOR || (chunk.score ?? 0) === 0);
    const queryRelevance = scoreQueryRelevance(card, query);
    const sourceClassRoleBonus = options.roleStrategy ? scoreCardForRole(card, options.roleStrategy) : sourceClassBaseBonus(card.sourceClass);
    const limitedSourcePenalty = card.limitedSource ? 12 : 0;
    const extractionBonus = card.extractionQuality === "full" ? 5 : card.extractionQuality === "partial" ? 3 : card.extractionQuality === "snippet" ? -4 : -20;
    const rankScore = queryRelevance * 0.55
      + Math.max(0, Math.min(100, card.relevanceScore)) * 0.2
      + Math.min(25, bestChunkBm25 * 8)
      + citationStrengthBonus(card.citationStrength)
      - limitedSourcePenalty
      + sourceClassRoleBonus
      + extractionBonus;
    return [{
      ...card,
      topChunks: flooredChunks.length ? flooredChunks : card.topChunks,
      queryRelevanceScore: queryRelevance,
      roleRelevanceScore: sourceClassRoleBonus,
      rankScore,
    }];
  });
  return ranked.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0)
    || (b.queryRelevanceScore ?? 0) - (a.queryRelevanceScore ?? 0)
    || b.relevanceScore - a.relevanceScore
    || a.sourceId - b.sourceId);
}
