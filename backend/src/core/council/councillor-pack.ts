import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import { buildEvidencePacks } from "../evidence/evidence-pack/build-evidence-packs.js";
import type { EvidencePack, EvidencePackBuildOptions } from "../evidence/evidence-pack/types.js";
import { COUNCIL_LIMITS } from "./council-config.js";
import type { RetrievingCouncillorId } from "./council-types.js";

export function buildCouncillorPacks(
  registry: EvidenceRegistryCore,
  contract: AgendaContract,
  councillorId: RetrievingCouncillorId,
  options: EvidencePackBuildOptions = {},
): Record<string, EvidencePack> {
  return buildEvidencePacks(registry, contract, {
    ...options,
    mode: "council",
    query: `${contract.normalizedAgenda} ${councillorId}`,
    maxCardsPerPack: options.maxCardsPerPack ?? COUNCIL_LIMITS.maxCardsPerPack,
  });
}

export function flattenCouncilEvidencePacks(packs: Record<string, EvidencePack>): EvidencePack {
  const seen = new Set<number>();
  const cards = Object.values(packs).flatMap((pack) => pack.cards).filter((card) => {
    if (seen.has(card.sourceId)) return false;
    seen.add(card.sourceId);
    return true;
  });
  return {
    id: "councilCombinedPack",
    cards: cards.slice(0, COUNCIL_LIMITS.maxCardsInCouncillorPrompt),
    limitations: [...new Set(Object.values(packs).flatMap((pack) => pack.limitations))],
  };
}
