import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";

export function packCardLimit(contract: AgendaContract, mode: ResearchMode | undefined, override?: number): number {
  if (override !== undefined) return Math.max(1, override);
  if (mode === "fast_research") return Math.max(40, contract.minimumEvidenceCardsPerModel);
  if (mode === "deep_research") return Math.max(80, contract.minimumEvidenceCardsPerModel);
  if (mode === "council") return Math.min(16, Math.max(10, contract.minimumEvidenceCardsPerModel));
  return Math.min(18, Math.max(10, contract.minimumEvidenceCardsPerModel));
}

export function namedPackLimit(mode: ResearchMode | undefined, override?: number): number {
  if (override !== undefined) return Math.max(1, override);
  if (mode === "fast_research") return 40;
  if (mode === "deep_research") return 80;
  if (mode === "council") return 12;
  return 15;
}
