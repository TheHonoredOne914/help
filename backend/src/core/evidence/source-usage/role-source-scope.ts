import type { SourceUsageMapItem, StructuredSourceUsageFailure } from "./types.js";
import { sourceUsageFailure } from "./failure-reporting.js";

export function normalizeAllowedSourceIds(sourceIds?: Iterable<number>): Set<number> | null {
  if (!sourceIds) return null;
  const ids = new Set<number>();
  for (const sourceId of sourceIds) {
    if (Number.isFinite(sourceId)) ids.add(Number(sourceId));
  }
  return ids;
}

export function validateRoleSourceScope(
  roleName: string,
  item: SourceUsageMapItem,
  allowedSourceIds: Set<number> | null,
): StructuredSourceUsageFailure | null {
  if (!allowedSourceIds) return null;
  if (allowedSourceIds.size === 0) {
    return sourceUsageFailure("cross_batch_reference", roleName, `No sources were assigned to ${roleName}.`, item);
  }
  if (allowedSourceIds.has(item.sourceId)) return null;
  return sourceUsageFailure("cross_batch_reference", roleName, `Source ${item.sourceId} was not assigned to ${roleName}.`, item);
}
