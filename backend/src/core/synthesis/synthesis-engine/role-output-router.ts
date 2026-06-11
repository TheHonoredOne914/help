/**
 * Brick 18 — Role output router.
 *
 * B18-09: Full per-division role mapping instead of defaulting 8/11 divisions
 * to the same 3-role set.
 */

import type { ModelRoleOutput } from "../../evidence/source-usage-map.js";
import type { CanonicalDivisionId } from "./types.js";

/**
 * Per-division role assignments — each division gets a unique role set
 * instead of the old 3-role default for 8 divisions.
 */
const DIVISION_ROLE_MAP: Record<CanonicalDivisionId, string[]> = {
  core_brief: ["evidence_extractor", "thesis_synthesizer"],
  analytical_dimensions: ["evidence_extractor", "thesis_synthesizer", "legal_analyst"],
  stakeholder_mapping: ["evidence_extractor", "indian_parliamentary_strategist"],
  conflict_mapping: ["evidence_extractor", "thesis_synthesizer"],
  narrative_analysis: ["thesis_synthesizer", "indian_parliamentary_strategist"],
  evidence_verification: ["evidence_extractor", "citation_auditor", "retrieval_critic"],
  debate_utility: ["indian_parliamentary_strategist", "legal_analyst", "data_analyst"],
  policy_pathways: ["evidence_extractor", "legal_analyst", "thesis_synthesizer"],
  predictive_analysis: ["thesis_synthesizer", "data_analyst"],
  resolution_support: ["legal_analyst", "indian_parliamentary_strategist"],
  strategic_insights: ["thesis_synthesizer", "retrieval_critic", "citation_auditor"],
};

/**
 * Get the role names assigned to a specific division.
 */
export function getRolesForDivision(divisionId: CanonicalDivisionId): string[] {
  return DIVISION_ROLE_MAP[divisionId] ?? ["evidence_extractor", "thesis_synthesizer"];
}

/**
 * Select role outputs relevant to a division using the new per-division mapping.
 * B18-09 fix: each division gets its own role set.
 */
export function selectRoleOutputsForDivisionEngine(
  divisionId: CanonicalDivisionId,
  outputs: ModelRoleOutput[],
): ModelRoleOutput[] {
  const roles = getRolesForDivision(divisionId);
  return roles
    .map((role) => outputs.find((output) => output.roleName === role))
    .filter((output): output is ModelRoleOutput => Boolean(output));
}

/**
 * B18-17, B18-19: Extract roleSummary and divisionHints from role outputs.
 * These are model-derived, not hardcoded.
 */
export function extractRoleIntelligence(
  outputs: ModelRoleOutput[],
): { roleSummaries: string[]; divisionHints: string[] } {
  const roleSummaries: string[] = [];
  const divisionHints: string[] = [];

  for (const output of outputs) {
    const payload = output.output as any;
    if (payload?.roleSummary && typeof payload.roleSummary === "string") {
      roleSummaries.push(`${output.roleName}: ${payload.roleSummary}`);
    }
    if (payload?.divisionHints && Array.isArray(payload.divisionHints)) {
      for (const hint of payload.divisionHints) {
        if (typeof hint === "string" && hint.trim()) {
          divisionHints.push(hint);
        }
      }
    }
  }

  return { roleSummaries, divisionHints };
}
