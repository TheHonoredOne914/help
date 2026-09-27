import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";
import type { ResearchMode } from "../../src/core/config/research-mode.js";
import { buildSourceUsageMapFromRegistry } from "../../src/core/evidence/source-usage-map.js";
import type { AgendaContract } from "../../src/core/agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "../../src/core/evidence/evidence-registry.js";
import type { ModelRoleOutput } from "../../src/core/evidence/source-usage-map.js";

/** Build a deterministic source-usage role output sized to the mode policy floor. */
export function buildModeSourceUsageMap(
  mode: ResearchMode,
  roleName: Parameters<typeof buildSourceUsageMapFromRegistry>[0],
  evidenceRegistry: EvidenceRegistryCore,
  agendaContract: AgendaContract,
  count?: number,
): ModelRoleOutput {
  const required = count ?? getSourceUsagePolicy(mode).requiredSources;
  const available = evidenceRegistry.getCitationEligibleCount();
  return buildSourceUsageMapFromRegistry(
    roleName,
    evidenceRegistry,
    agendaContract,
    Math.min(required, available),
  );
}
