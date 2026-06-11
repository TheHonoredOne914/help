export function normalizeSseShape(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.type && !payload.eventType) return { ...payload, eventType: payload.type };
  return payload;
}
