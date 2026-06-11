import type { ModelRoleOutput, SourceUsageMapItem, SourceUsageValidationReport } from "./types.js";

export function filterUsageItemsForValidatedHandoff(items: SourceUsageMapItem[], validation: SourceUsageValidationReport): SourceUsageMapItem[] {
  const approvedIds = new Set(validation.usedSourceIds);
  const approvedKeys = new Set(validation.approvedUsageItems.map((item) => `${item.sourceId}:${item.usageType}:${item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.limitation ?? item.supportedSection ?? ""}`));
  return items.filter((item) => {
    if (!approvedIds.has(item.sourceId)) return false;
    const key = `${item.sourceId}:${item.usageType}:${item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.limitation ?? item.supportedSection ?? ""}`;
    return approvedKeys.size === 0 || approvedKeys.has(key);
  });
}

export function syncModelRoleOutputWithValidation<T extends ModelRoleOutput>(output: T, validation: SourceUsageValidationReport): T {
  const usedSourceIds = validation.usedSourceIds;
  const syncedUsageMap = filterUsageItemsForValidatedHandoff(output.sourceUsageMap, validation);
  const priorOutput = typeof output.output === "object" && output.output !== null && !Array.isArray(output.output)
    ? output.output as Record<string, unknown>
    : { value: output.output };
  return {
    ...output,
    usedSourceIds,
    unusedSourceIds: output.receivedSourceIds.filter((sourceId) => !usedSourceIds.includes(sourceId)),
    sourceUsageMap: syncedUsageMap,
    sourceCountUsed: usedSourceIds.length,
    sourceUsageCount: usedSourceIds.length,
    sourceRequirementSatisfied: validation.passed,
    sourceUsageRequirementSatisfied: validation.passed,
    output: {
      ...priorOutput,
      validation,
    },
  };
}
