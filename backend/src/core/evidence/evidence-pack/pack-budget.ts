import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";

/** Approx token budgets for pack serialization by mode. */
export function packTokenBudget(mode: ResearchMode | undefined): number {
  if (mode === "fast_research") return 6_000;
  if (mode === "deep_research") return 12_000;
  if (mode === "council") return 48_000;
  return 5_000;
}

/** ~4 chars/token heuristic for card body budgeting. */
export function approxTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}

export function packCardLimit(contract: AgendaContract, mode: ResearchMode | undefined, override?: number): number {
  if (override !== undefined) return Math.max(1, override);
  // Align with P0 deep floor 45 — do not force 80 weak cards.
  if (mode === "fast_research") return Math.max(40, Math.min(48, contract.minimumEvidenceCardsPerModel || 40));
  if (mode === "deep_research") return Math.max(45, Math.min(60, contract.minimumEvidenceCardsPerModel || 45));
  // Council citation floor is 110 — packs must carry enough strong cards for generation + length repair.
  if (mode === "council") {
    const floor = Math.max(110, contract.minimumUniqueCitedSources || contract.minimumEvidenceCardsPerModel || 110);
    return Math.min(160, floor);
  }
  return Math.min(18, Math.max(10, contract.minimumEvidenceCardsPerModel));
}

export function namedPackLimit(mode: ResearchMode | undefined, override?: number): number {
  if (override !== undefined) return Math.max(1, override);
  if (mode === "fast_research") return 40;
  if (mode === "deep_research") return 45;
  if (mode === "council") return 110;
  return 15;
}

/** Cap cards so serialized pack stays under token budget. */
export function trimCardsToTokenBudget<T extends { contentPreview?: string; topChunks: Array<{ text: string }>; keyFacts: string[] }>(
  cards: T[],
  mode: ResearchMode | undefined,
): T[] {
  const budget = packTokenBudget(mode);
  const out: T[] = [];
  let used = 0;
  for (const card of cards) {
    const cost = approxTokens([
      card.contentPreview ?? "",
      ...card.topChunks.slice(0, 2).map((chunk) => chunk.text),
      ...card.keyFacts.slice(0, 2),
    ].join(" "));
    if (out.length > 0 && used + cost > budget) break;
    out.push(card);
    used += cost;
  }
  return out.length ? out : cards.slice(0, 1);
}
