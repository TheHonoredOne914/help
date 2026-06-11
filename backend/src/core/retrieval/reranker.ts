import { scoreSourceForAgenda } from "./source-scoring.js";
import type { AgendaContract } from "../agenda/agenda-contract.js";

export function rerankSourcesForAgenda<T extends { url: string; title: string; snippet?: string; domain?: string }>(
  sources: T[],
  contract: AgendaContract,
): T[] {
  const scored = sources.map((source) => ({ source, score: scoreSourceForAgenda(source, contract).score }));
  return scored.sort((a, b) => b.score - a.score).map((item) => item.source);
}
