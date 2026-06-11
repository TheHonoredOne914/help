export function runStateTelemetryEvent(type: string, data: Record<string, unknown> = {}): { type: string; data: Record<string, unknown>; timestamp: string } {
  return { type, data, timestamp: new Date().toISOString() };
}
