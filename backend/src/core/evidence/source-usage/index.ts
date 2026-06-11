import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "../evidence-registry.js";
import { balancedSources } from "./batch-coverage.js";
import { syncModelRoleOutputWithValidation } from "./claim-ledger-integration.js";
import { buildDeterministicUsageItemFromSource } from "./deterministic-map-builder.js";
import { validateSourceUsageMap } from "./validate-source-usage-map.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "./types.js";

export * from "./types.js";
export * from "./validate-source-usage-map.js";
export * from "./claim-grounding.js";
export * from "./evidence-span-matcher.js";
export * from "./source-eligibility.js";
export * from "./source-usage-normalizer.js";
export * from "./deterministic-map-builder.js";
export * from "./batch-coverage.js";
export * from "./aggregate-source-usage.js";
export * from "./role-source-scope.js";
export * from "./failure-reporting.js";
export * from "./claim-ledger-integration.js";
export * from "./telemetry.js";

export function buildSourceUsageMapFromRegistry(
  roleName: string,
  registry: EvidenceRegistryCore,
  contract: AgendaContract,
  requiredCount = contract.minimumEvidenceCardsPerModel,
): ModelRoleOutput {
  const sources = balancedSources(registry.getCitationEligibleSources(), Math.max(requiredCount, 0));
  const sourceUsageMap: SourceUsageMapItem[] = sources.map((source) => buildDeterministicUsageItemFromSource(source));
  const receivedSourceIds = registry.getCitationEligibleSources().map((source) => source.id);
  const rawOutput: ModelRoleOutput = {
    roleName,
    minimumSourceRequirement: requiredCount,
    requiredSourceCount: requiredCount,
    receivedSourceIds,
    usedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    unusedSourceIds: receivedSourceIds.filter((sourceId) => !sourceUsageMap.some((item) => item.sourceId === sourceId)),
    sourceUsageMap,
    sourceCountUsed: sourceUsageMap.length,
    sourceRequirementSatisfied: false,
    sourceUsageCount: sourceUsageMap.length,
    sourceUsageRequirementSatisfied: false,
    output: { deterministicExtraction: true },
  };
  const validation = validateSourceUsageMap(rawOutput, registry, contract, Math.min(requiredCount, registry.getCitationEligibleCount()), {}, true);
  const synced = syncModelRoleOutputWithValidation(rawOutput, validation);
  const satisfied = validation.passed;
  return {
    ...synced,
    sourceRequirementSatisfied: satisfied,
    sourceUsageRequirementSatisfied: satisfied,
    sourceGapReason: satisfied ? undefined : validation.failures.join("; ") || undefined,
    failureReason: satisfied ? undefined : validation.failures.join("; ") || undefined,
  };
}
