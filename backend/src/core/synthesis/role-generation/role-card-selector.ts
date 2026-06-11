import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";
import type { EvidenceCard } from "../../evidence/evidence-pack-builder.js";
import { buildModelEvidencePack, type EvidencePack } from "../../evidence/evidence-pack-builder.js";
import { isKnownRole } from "./role-definitions.js";

export function selectCardsForRole(
  roleName: string,
  packsById: Record<string, EvidencePack>,
  allCards: EvidenceCard[],
  contract: AgendaContract,
  mode?: ResearchMode,
): EvidenceCard[] {
  if (isKnownRole(roleName)) {
    const selected = buildModelEvidencePack(roleName, packsById, contract, { mode }).cards;
    if (selected.length > 0) return selected;
  }
  return [...allCards].sort((a, b) => qualityScore(b) - qualityScore(a) || a.sourceId - b.sourceId);
}

function qualityScore(card: EvidenceCard): number {
  const strength = card.citationStrength === "strong" ? 50 : card.citationStrength === "medium" ? 35 : card.citationStrength === "weak" ? 10 : -30;
  const extraction = card.extractionQuality === "full" ? 25 : card.extractionQuality === "partial" ? 18 : card.extractionQuality === "snippet" ? 3 : -30;
  const content = Math.min(20, card.keyFacts.length * 4 + card.keyNumbers.length * 5 + card.legalHoldings.length * 8 + card.topChunks.length * 2);
  return strength + extraction + content - (card.limitedSource ? 25 : 0);
}
