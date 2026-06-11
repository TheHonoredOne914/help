import type { ModelRoleOutput } from "../../evidence/source-usage-map.js";

const DIVISION_ROLE_MAP: Array<{ pattern: RegExp; roles: string[] }> = [
  { pattern: /D7|debate_utility|debate utility/i, roles: ["indian_parliamentary_strategist", "legal_analyst", "data_analyst"] },
  { pattern: /D11|strategic_insights|strategic synthesis|strategic insights/i, roles: ["thesis_synthesizer", "retrieval_critic", "citation_auditor"] },
  { pattern: /evidence|verification|citation/i, roles: ["evidence_extractor", "citation_auditor"] },
  { pattern: /legal|constitutional|court|judicial/i, roles: ["legal_analyst"] },
  { pattern: /data|stat|number|trend|ranking/i, roles: ["data_analyst"] },
];

export function roleNamesForDivision(divisionId: string): string[] {
  return DIVISION_ROLE_MAP.find((entry) => entry.pattern.test(divisionId))?.roles
    ?? ["evidence_extractor", "thesis_synthesizer", "citation_auditor"];
}

export function selectRoleOutputsForDivision(divisionId: string, outputs: ModelRoleOutput[]): ModelRoleOutput[] {
  const roles = roleNamesForDivision(divisionId);
  return roles.map((role) => outputs.find((output) => output.roleName === role)).filter((output): output is ModelRoleOutput => Boolean(output));
}
