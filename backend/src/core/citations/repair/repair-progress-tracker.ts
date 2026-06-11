/**
 * Brick 20 — Repair progress tracker.
 *
 * BUG-20-05/BUG-20-23 FIX: Tracks repair iteration progress,
 * detects stale/no-progress loops, and provides early termination
 * signals for fatal unrepairable issues.
 */

import type { RepairType } from "./types.js";

export interface RepairIterationRecord {
  iteration: number;
  repairType: RepairType;
  beforeIssueCount: number;
  afterIssueCount: number;
  changed: boolean;
  durationMs: number;
}

export interface RepairProgressState {
  iterations: RepairIterationRecord[];
  maxIterations: number;
  staleCount: number;
  fatalIssueDetected: boolean;
  fatalReason?: string;
}

export class RepairProgressTracker {
  private state: RepairProgressState;
  private readonly maxStaleIterations = 2;
  private readonly seenRepairTypes = new Set<string>();

  constructor(maxIterations = 6) {
    this.state = {
      iterations: [],
      maxIterations,
      staleCount: 0,
      fatalIssueDetected: false,
    };
  }

  /**
   * Record a completed repair iteration.
   * Returns whether the orchestrator should continue.
   */
  recordIteration(record: RepairIterationRecord): boolean {
    this.state.iterations.push(record);

    // Detect no-progress
    if (!record.changed || record.afterIssueCount >= record.beforeIssueCount) {
      this.state.staleCount += 1;
    } else {
      this.state.staleCount = 0;
    }

    // Track repair type deduplication
    this.seenRepairTypes.add(record.repairType);

    return this.shouldContinue();
  }

  /**
   * Signal a fatal issue that should immediately stop repair.
   */
  markFatal(reason: string): void {
    this.state.fatalIssueDetected = true;
    this.state.fatalReason = reason;
  }

  /**
   * Check if a repair type has already been attempted.
   */
  hasAttempted(repairType: RepairType): boolean {
    return this.seenRepairTypes.has(repairType);
  }

  /**
   * Determine if the orchestrator should continue repairing.
   */
  shouldContinue(): boolean {
    if (this.state.fatalIssueDetected) return false;
    if (this.state.iterations.length >= this.state.maxIterations) return false;
    if (this.state.staleCount >= this.maxStaleIterations) return false;
    return true;
  }

  /**
   * Get a summary for telemetry.
   */
  getSummary(): {
    totalIterations: number;
    totalChanged: number;
    staleCount: number;
    fatalIssue: boolean;
    fatalReason?: string;
    repairTypes: string[];
  } {
    return {
      totalIterations: this.state.iterations.length,
      totalChanged: this.state.iterations.filter((r) => r.changed).length,
      staleCount: this.state.staleCount,
      fatalIssue: this.state.fatalIssueDetected,
      fatalReason: this.state.fatalReason,
      repairTypes: [...this.seenRepairTypes],
    };
  }

  getIterations(): RepairIterationRecord[] {
    return [...this.state.iterations];
  }
}
