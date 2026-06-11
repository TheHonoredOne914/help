import type { EvidenceCard } from "../evidence/evidence-pack-builder.js";

export interface DebateUtility {
  treasuryBenchArguments: string[];
  oppositionArguments: string[];
  pois: string[];
  rebuttals: string[];
  floorStrategy: string[];
  clauses: string[];
  coalitionMap: string[];
  redLines: string[];
  sourceAnchors: string[];
}

export function generateDebateUtility(cards: EvidenceCard[]): DebateUtility {
  const cited = cards.slice(0, 10).map((card) => card.citation);
  return {
    treasuryBenchArguments: cited.map((citation) => `Use official accountability and security framing with ${citation}.`),
    oppositionArguments: cited.map((citation) => `Use civil-liberties and oversight framing with ${citation}.`),
    pois: cited.slice(0, 8).map((citation) => `Which safeguard follows from ${citation}?`),
    rebuttals: cited.slice(0, 8).map((citation) => `Distinguish allegation, evidence, and constitutional threshold using ${citation}.`),
    floorStrategy: cited.slice(0, 8).map((citation) => `Anchor intervention in Indian parliamentary accountability and cite ${citation}.`),
    clauses: cited.slice(0, 8).map((citation) => `Recommends evidence-based safeguards recorded against ${citation}.`),
    coalitionMap: [
      "Treasury Bench can hold institutional-process voters if safeguards are explicit.",
      "Opposition can consolidate rights, transparency, and federalism objections.",
      "Regional or cross-bench delegates are movable when amendments preserve state capacity.",
    ],
    redLines: [
      "No uncited legal holding.",
      "No bare fraud or national-security overclaim.",
      "No source-free amendment language.",
    ],
    sourceAnchors: cited,
  };
}
