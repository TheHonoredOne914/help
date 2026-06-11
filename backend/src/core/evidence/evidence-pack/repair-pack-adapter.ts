import type { EvidencePack } from "./types.js";

const LINKED_SOURCE_PATTERN = /\[Source\s+(\d+)\]\(([^)]+)\)/gi;

export function repairCitationTextWithEvidencePacks(text: string, evidencePacks: EvidencePack[]): string {
  const cards = dedupeCards(evidencePacks.flatMap((pack) => pack.cards));
  if (cards.length === 0) return text.replace(LINKED_SOURCE_PATTERN, "[source unavailable]");
  const validIds = new Set(cards.map((card) => card.sourceId));
  let repaired = text.replace(LINKED_SOURCE_PATTERN, (match, sourceIdText) => {
    const sourceId = Number(sourceIdText);
    return validIds.has(sourceId) ? match : "";
  }).replace(/\s{2,}/g, " ").trim();
  if (![...repaired.matchAll(LINKED_SOURCE_PATTERN)].some((match) => validIds.has(Number(match[1])))) {
    // BUG-19-01/BUG-20-02/BUG-20-21 FIX: Do NOT append cards[0] unconditionally.
    // Instead, add a source-gap disclosure so the reader knows citations were stripped.
    repaired = `${repaired.replace(/\s+\.$/, ".")} [Source gap: all original citations were stripped during repair; claims above require independent registry corroboration before use.]`.trim();
  }
  return repaired;
}

function dedupeCards(cards: EvidencePack["cards"]): EvidencePack["cards"] {
  const byId = new Map<number, EvidencePack["cards"][number]>();
  for (const card of cards) {
    if (!byId.has(card.sourceId)) byId.set(card.sourceId, card);
  }
  return [...byId.values()].sort((a, b) => {
    const strength = strengthRank(b.citationStrength) - strengthRank(a.citationStrength);
    return strength || b.relevanceScore - a.relevanceScore || a.sourceId - b.sourceId;
  });
}

function strengthRank(strength: string): number {
  if (strength === "strong") return 4;
  if (strength === "medium") return 3;
  if (strength === "weak") return 2;
  return 0;
}
