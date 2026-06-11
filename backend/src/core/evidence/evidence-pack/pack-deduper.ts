import { compareEvidenceQuality } from "./citation-strength-ranker.js";
import type { EvidenceCard } from "./types.js";

export function dedupeEvidenceCards(cards: EvidenceCard[]): EvidenceCard[] {
  const byId = new Map<number, EvidenceCard[]>();
  for (const card of cards) {
    const group = byId.get(card.sourceId) ?? [];
    group.push(card);
    byId.set(card.sourceId, group);
  }
  return [...byId.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, group]) => [...group].sort(compareEvidenceQuality)[0]);
}
