export function buildStreamDiagnostics(data: Record<string, unknown> = {}): Record<string, unknown> {
  return { diagnosticsIncluded: true, ...data };
}
