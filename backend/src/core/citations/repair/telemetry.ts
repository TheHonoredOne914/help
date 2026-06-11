/**
 * Brick 20 — Repair Telemetry.
 *
 * Tracks the success rate, duration, and failure reasons of repair passes.
 */

import type { RepairProgressState } from "./repair-progress-tracker.js";

export interface RepairTelemetrySummary {
  totalPasses: number;
  changedPasses: number;
  totalBeforeIssues: number;
  totalAfterIssues: number;
  fatalIssueDetected: boolean;
  fatalReason?: string;
  repairTypesUsed: string[];
  durationMs: number;
}

export function buildRepairTelemetry(
  state: RepairProgressState,
  startTimeMs: number,
): RepairTelemetrySummary {
  const totalBefore = state.iterations.reduce((sum, iter) => sum + iter.beforeIssueCount, 0);
  const totalAfter = state.iterations.reduce((sum, iter) => sum + iter.afterIssueCount, 0);

  return {
    totalPasses: state.iterations.length,
    changedPasses: state.iterations.filter((iter) => iter.changed).length,
    totalBeforeIssues: totalBefore,
    totalAfterIssues: totalAfter,
    fatalIssueDetected: state.fatalIssueDetected,
    fatalReason: state.fatalReason,
    repairTypesUsed: [...new Set(state.iterations.map((iter) => iter.repairType))],
    durationMs: Date.now() - startTimeMs,
  };
}

export function logRepairTelemetry(summary: RepairTelemetrySummary, requestId: string): void {
  const reduction = summary.totalBeforeIssues > 0
    ? Math.round(((summary.totalBeforeIssues - summary.totalAfterIssues) / summary.totalBeforeIssues) * 100)
    : 0;

  console.log(`[RepairTelemetry:${requestId}] Passes: ${summary.totalPasses} (${summary.changedPasses} changed). Issues: ${summary.totalBeforeIssues} -> ${summary.totalAfterIssues} (${reduction}% reduction). Fatal: ${summary.fatalIssueDetected} ${summary.fatalReason ? `(${summary.fatalReason})` : ""}`);
}
