export function serializeDivisionOutputs(outputs: unknown): Record<string, string> {
  const entries = outputs instanceof Map
    ? [...outputs.entries()]
    : outputs && typeof outputs === "object"
      ? Object.entries(outputs as Record<string, unknown>)
      : [];

  const serialized: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    if (typeof rawKey !== "string" || typeof rawValue !== "string") continue;
    const value = rawValue.trim();
    if (!value) continue;
    serialized[rawKey] = value;
  }
  return serialized;
}

export function restoreDivisionOutputs(outputs: unknown): Map<string, string> {
  return new Map(Object.entries(serializeDivisionOutputs(outputs)));
}
