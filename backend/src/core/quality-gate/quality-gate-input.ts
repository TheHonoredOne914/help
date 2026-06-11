import type { QualityGateInput } from "./types.js";

export function getDivisionText(input: QualityGateInput, id: string): string {
  const outputs = input.divisionOutputs;
  if (!outputs) return "";
  if (outputs instanceof Map) return outputs.get(id) ?? getPrefixedMapDivision(outputs, id) ?? outputs.get(normalizeDivisionAlias(id)) ?? "";
  return outputs[id] ?? getPrefixedRecordDivision(outputs, id) ?? outputs[normalizeDivisionAlias(id)] ?? "";
}

export function finalSection(text: string, heading: RegExp): string {
  const match = text.match(heading);
  if (!match || match.index == null) return "";
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/\n#{1,3}\s+/);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

export function wordCount(text: string): number {
  return (text.trim().match(/\b[\w'-]+\b/g) ?? []).length;
}

export function extractCitationIds(text: string): number[] {
  return [...text.matchAll(/\[Source\s+(\d+)\]\(https?:\/\/[^)]+\)/gi)].map((match) => Number(match[1]));
}

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeDivisionAlias(id: string): string {
  const aliases: Record<string, string> = {
    D1: "core_brief",
    D2: "analytical_dimensions",
    D3: "stakeholder_mapping",
    D4: "conflict_mapping",
    D5: "narrative_analysis",
    D6: "evidence_verification",
    D7: "debate_utility",
    D8: "policy_pathways",
    D9: "predictive_analysis",
    D10: "resolution_support",
    D11: "strategic_insights",
  };
  return aliases[id] ?? id;
}

function getPrefixedMapDivision(outputs: Map<string, string>, id: string): string | undefined {
  const prefix = `${id.toLowerCase()}_`;
  for (const [key, value] of outputs.entries()) {
    if (key.toLowerCase().startsWith(prefix)) return value;
  }
  return undefined;
}

function getPrefixedRecordDivision(outputs: Record<string, string>, id: string): string | undefined {
  const prefix = `${id.toLowerCase()}_`;
  const key = Object.keys(outputs).find((item) => item.toLowerCase().startsWith(prefix));
  return key ? outputs[key] : undefined;
}
