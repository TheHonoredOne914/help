/**
 * Brick 18 — Synthesis Engine telemetry.
 */

export function emitSynthesisTelemetry(
  event: string,
  data: Record<string, unknown> = {},
): void {
  // Telemetry sink — wired into lib/telemetry.ts in future phases.
  void event;
  void data;
}
