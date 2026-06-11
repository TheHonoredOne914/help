import type { AgendaContract } from "../../agenda/agenda-contract.js";
import { applyDomainDiversity } from "./domain-diversity.js";
import { packCardLimit } from "./pack-budget.js";
import { rankEvidenceCards } from "./pack-ranking.js";
import { resolveRolePackStrategy } from "./role-pack-strategy.js";
import type { EvidencePack, EvidencePackBuildOptions } from "./types.js";

export function buildModelEvidencePack(
  roleName: string,
  packs: Record<string, EvidencePack>,
  contract: AgendaContract,
  options: EvidencePackBuildOptions = {},
): EvidencePack {
  const strategy = resolveRolePackStrategy(roleName);
  const query = options.query ?? contract.normalizedAgenda ?? contract.originalUserQuery;
  const allCards = Object.values(packs).flatMap((pack) => pack.cards);
  const ranked = rankEvidenceCards(allCards, { query, roleStrategy: strategy });
  const filtered = strategy.includeWeakForCritique
    ? ranked
    : ranked.filter((card) => card.citationStrength !== "ineligible");
  const limit = packCardLimit(contract, options.mode, options.maxCardsPerPack);
  const selected = applyDomainDiversity(filtered, {
    limit: Math.max(limit, contract.minimumEvidenceCardsPerModel),
    earlyWindow: Math.min(12, Math.max(limit, contract.minimumEvidenceCardsPerModel)),
    maxPerDomainEarly: strategy.preferDiversity ? 3 : 4,
    maxPerDomain: strategy.preferDiversity ? 4 : 5,
  });
  const limitations: string[] = [];
  if (strategy.warning) limitations.push(strategy.warning);
  if (selected.length < contract.minimumEvidenceCardsPerModel) {
    limitations.push(`SourceGapReport required: only ${selected.length} cards available.`);
  }
  return {
    id: `${roleName}_model_pack`,
    cards: selected,
    limitations,
  };
}
