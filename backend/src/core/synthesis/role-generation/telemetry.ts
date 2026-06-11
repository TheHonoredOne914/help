export function emitRoleGenerationTelemetry(
  emit: ((type: string, data?: Record<string, unknown>) => void) | undefined,
  type: string,
  data: Record<string, unknown> = {},
): void {
  emit?.(type, data);
}
