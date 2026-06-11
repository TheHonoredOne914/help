export function normalizeDivisionOutputs(value: unknown): Record<string, string> {
  const entries = value instanceof Map
    ? [...value.entries()]
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
      : [];
  const normalized: Record<string, string> = {};
  for (const [key, output] of entries) {
    if (typeof key !== "string" || typeof output !== "string") continue;
    const text = output.trim();
    if (text) normalized[key] = text;
  }
  return normalized;
}
