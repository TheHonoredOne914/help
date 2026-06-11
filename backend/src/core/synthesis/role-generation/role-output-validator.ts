import {
  validateSourceUsageMap,
  type ModelRoleOutput,
  type SourceUsageValidationReport,
} from "../../evidence/source-usage-map.js";
import type { RoleOutputValidationInput } from "./types.js";

export function validateRoleOutput(input: RoleOutputValidationInput): SourceUsageValidationReport {
  const usedSourceIds = [...new Set(input.items.map((item) => Number(item.sourceId)).filter(Number.isFinite))];
  const output: ModelRoleOutput = {
    roleName: input.roleName,
    requiredSourceCount: input.requiredCount,
    receivedSourceIds: [...input.allowedSourceIds].map(Number),
    usedSourceIds,
    unusedSourceIds: [...input.allowedSourceIds].map(Number).filter((sourceId) => !usedSourceIds.includes(sourceId)),
    sourceUsageMap: input.items,
    sourceUsageCount: usedSourceIds.length,
    sourceUsageRequirementSatisfied: false,
    output: {},
  };
  return validateSourceUsageMap(output, input.evidenceRegistry, input.agendaContract, input.requiredCount, {
    allowedSourceIds: input.allowedSourceIds,
  });
}
