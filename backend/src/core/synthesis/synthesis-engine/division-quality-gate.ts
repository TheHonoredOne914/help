/**
 * Brick 18 — Division quality gate.
 *
 * Validates ALL 11 division outputs (B18-25, B18-26), not just D7/D11.
 * Quality gate validates division output content, not the section plan (B18-25).
 * Validation failure → deterministic fallback, never empty (B18-31).
 */

import type { CanonicalDivisionId, DivisionOutput } from "./types.js";

export interface QualityGateResult {
  passed: boolean;
  issues: string[];
}

/** Minimum word counts per division for a passing quality gate. */
const DIVISION_MIN_WORDS: Record<CanonicalDivisionId, number> = {
  core_brief: 40,
  analytical_dimensions: 50,
  stakeholder_mapping: 40,
  conflict_mapping: 40,
  narrative_analysis: 40,
  evidence_verification: 40,
  debate_utility: 80,
  policy_pathways: 40,
  predictive_analysis: 30,
  resolution_support: 30,
  strategic_insights: 60,
};

/** Required content markers per division. */
const DIVISION_REQUIRED_MARKERS: Partial<Record<CanonicalDivisionId, RegExp[]>> = {
  debate_utility: [
    /treasury\s*bench|government|ruling/i,
    /opposition/i,
    /POI|point\s*of\s*information/i,
    /rebuttal|counter/i,
  ],
  strategic_insights: [
    /diagnosis|strategic/i,
    /prescription|recommend/i,
  ],
  evidence_verification: [
    /source|evidence|tier/i,
  ],
  resolution_support: [
    /clause|operative|preambul/i,
  ],
};

/**
 * Run quality gate on a single division output.
 * Checks: minimum word count, required markers, placeholder detection,
 * and citation presence.
 */
export function validateDivisionOutput(output: DivisionOutput): QualityGateResult {
  const issues: string[] = [];
  const text = output.text.trim();

  // Check for placeholder/empty output
  if (!text || /^Source gap\.?$/i.test(text)) {
    issues.push(`D${output.divisionNumber} (${output.divisionId}) is empty or a source gap placeholder.`);
    return { passed: false, issues };
  }

  // Check minimum word count
  const wordCount = text.split(/\s+/).length;
  const minWords = DIVISION_MIN_WORDS[output.divisionId] ?? 30;
  if (wordCount < minWords) {
    issues.push(`D${output.divisionNumber} (${output.divisionId}) has ${wordCount} words, requires at least ${minWords}.`);
  }

  // Check required content markers
  const markers = DIVISION_REQUIRED_MARKERS[output.divisionId];
  if (markers) {
    for (const marker of markers) {
      if (!marker.test(text)) {
        issues.push(`D${output.divisionNumber} (${output.divisionId}) missing required content: ${marker.source}.`);
      }
    }
  }

  // Check for template-only content (B18-06: no evidence-grounded content)
  if (/^(?:D\d+ |## DIVISION \d+|## [A-Z])/.test(text) && !/\[Source \d+\]/i.test(text) && !/ClaimGraph|ClaimLedger|registry/i.test(text)) {
    if (wordCount < minWords * 2) {
      issues.push(`D${output.divisionNumber} (${output.divisionId}) appears to be template-only content without evidence grounding.`);
    }
  }

  return { passed: issues.length === 0, issues };
}

/**
 * Run quality gate on all division outputs.
 * Returns aggregated results.
 */
export function validateAllDivisionOutputs(
  outputs: Map<CanonicalDivisionId, DivisionOutput>,
): { passed: boolean; results: Map<CanonicalDivisionId, QualityGateResult>; totalIssues: string[] } {
  const results = new Map<CanonicalDivisionId, QualityGateResult>();
  const totalIssues: string[] = [];

  for (const [id, output] of outputs) {
    const result = validateDivisionOutput(output);
    results.set(id, result);
    if (!result.passed) {
      totalIssues.push(...result.issues);
    }
  }

  return {
    passed: totalIssues.length === 0,
    results,
    totalIssues,
  };
}
