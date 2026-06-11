import type { SourceUsageMapItem } from "../../evidence/source-usage-map.js";

export interface CrossBatchGuardResult {
  accepted: SourceUsageMapItem[];
  rejectedSourceIds: number[];
  warning?: string;
}

export function filterOutOfBatchUsageItems(
  roleName: string,
  items: SourceUsageMapItem[],
  allowedSourceIds: Iterable<number>,
): CrossBatchGuardResult {
  const allowed = new Set([...allowedSourceIds].map(Number));
  const accepted: SourceUsageMapItem[] = [];
  const rejectedSourceIds: number[] = [];
  for (const item of items) {
    if (allowed.has(Number(item.sourceId))) accepted.push(item);
    else rejectedSourceIds.push(Number(item.sourceId));
  }
  return {
    accepted,
    rejectedSourceIds,
    warning: rejectedSourceIds.length
      ? `${roleName} cross-batch contamination rejected source IDs: ${[...new Set(rejectedSourceIds)].join(", ")}`
      : undefined,
  };
}
