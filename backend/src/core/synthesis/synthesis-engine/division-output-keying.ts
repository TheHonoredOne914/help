/**
 * Brick 18 — Division output keying.
 *
 * Fixes B18-34: division output map uses single canonical key per division.
 * No more double-keying with both `divisionId` and `D${n}_${divisionId}`.
 */

import type { CanonicalDivisionId, DivisionOutput } from "./types.js";

/** Division number lookup. */
const DIVISION_NUMBERS: Record<CanonicalDivisionId, number> = {
  core_brief: 1,
  analytical_dimensions: 2,
  stakeholder_mapping: 3,
  conflict_mapping: 4,
  narrative_analysis: 5,
  evidence_verification: 6,
  debate_utility: 7,
  policy_pathways: 8,
  predictive_analysis: 9,
  resolution_support: 10,
  strategic_insights: 11,
};

export function getDivisionNumber(divisionId: CanonicalDivisionId): number {
  return DIVISION_NUMBERS[divisionId] ?? 0;
}

/**
 * Normalize any division key variant into the canonical ID.
 * Accepts: "core_brief", "D1_core_brief", "D1", "debate_utility", "D7_debate_utility", etc.
 */
export function normalizeToCanonicalId(key: string): CanonicalDivisionId | null {
  // Direct match
  if (key in DIVISION_NUMBERS) return key as CanonicalDivisionId;

  // Strip "D<n>_" prefix
  const stripped = key.replace(/^D\d+_/, "");
  if (stripped in DIVISION_NUMBERS) return stripped as CanonicalDivisionId;

  // Match by "D<n>" alone
  const match = /^D(\d+)$/i.exec(key);
  if (match) {
    const number = parseInt(match[1], 10);
    const entry = Object.entries(DIVISION_NUMBERS).find(([, num]) => num === number);
    if (entry) return entry[0] as CanonicalDivisionId;
  }

  return null;
}

/**
 * Build the backward-compatible text map from structured DivisionOutput map.
 * Returns a Map<string, string> keyed by canonical division ID only.
 */
export function buildTextMapFromOutputs(outputs: Map<CanonicalDivisionId, DivisionOutput>): Map<string, string> {
  const textMap = new Map<string, string>();
  for (const [id, output] of outputs) {
    textMap.set(id, output.text);
  }
  return textMap;
}
