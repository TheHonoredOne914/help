import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidenceCard } from "../evidence/evidence-pack-builder.js";

export function buildThesisSkeleton(contract: AgendaContract, cards: EvidenceCard[]): string {
  const usableCards = cards
    .filter((card) => card.citationStrength !== "ineligible" && card.extractionQuality !== "failed")
    .slice(0, contract.minimumUniqueCitedSources);
  const citations = usableCards.map((card) => card.citation).join(" ");
  const legal = usableCards.find((card) => card.legalHoldings.length > 0 || card.bucketIds.includes("court_legal"));
  const data = usableCards.find((card) => card.keyNumbers.length > 0);
  const central = usableCards[0]?.keyFacts[0] ?? usableCards[0]?.debateUse ?? contract.normalizedAgenda;
  return [
    "# Executive Thesis",
    `Claim spine: ${central} ${citations}`,
    `Central contradiction: Treasury Bench must defend legality, accountability, and public order with cited records, while Opposition should test proportionality, rights impact, federalism, and implementation gaps.`,
    legal ? `Legal anchor: ${legal.legalHoldings[0] ?? legal.keyFacts[0] ?? legal.title} ${legal.citation}` : "Legal anchor: no legal source was strong enough for an unqualified holding; frame this as a source gap.",
    data ? `Data anchor: ${data.keyNumbers[0] ?? data.keyFacts[0]} ${data.citation}` : "Data anchor: no numerical source was strong enough for an unqualified statistic; avoid invented numbers.",
    "# Indian Mock Parliament Debate Utility Arsenal",
    "Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, and final strategic synthesis must all cite the evidence registry and qualify weak/snippet evidence.",
  ].join("\n\n");
}
