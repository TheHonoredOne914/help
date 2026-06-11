/**
 * Brick 18 — Division prompt builder.
 *
 * Builds per-division prompts with ClaimGraph, ClaimLedger, and role context
 * for model-backed synthesis (B18-16, B18-24, B18-33).
 */

import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ClaimGraph } from "../../evidence/claim-graph.js";
import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { ModelRoleOutput } from "../../evidence/source-usage-map.js";
import type { SourceGapReport } from "../../evidence/source-gap-report.js";
import { selectRoleOutputsForDivision } from "../role-generation/role-division-router.js";
import { buildClaimContextForDivision } from "./claim-context-builder.js";
import type { CanonicalDivisionId } from "./types.js";

export interface DivisionPrompt {
  system: string;
  user: string;
  claimCount: number;
}

/**
 * Build a model-backed synthesis prompt for a specific division.
 * Includes ClaimGraph claims, ClaimLedger summary, role output evidence,
 * and division-specific instructions.
 */
export function buildDivisionPrompt(
  divisionId: CanonicalDivisionId,
  divisionName: string,
  divisionInstructions: string,
  context: {
    agendaContract: AgendaContract;
    claimGraph: ClaimGraph;
    claimLedger: ClaimLedger;
    evidenceRegistry: EvidenceRegistryCore;
    modelRoleOutputs: ModelRoleOutput[];
    sourceGapReport?: SourceGapReport | null;
    userQuery: string;
  },
): DivisionPrompt {
  const claimContext = buildClaimContextForDivision(
    context.claimGraph,
    divisionId,
    divisionName,
    context.evidenceRegistry,
  );
  const roleOutputs = selectRoleOutputsForDivision(
    `D${getDivisionNumber(divisionId)}_${divisionId}`,
    context.modelRoleOutputs,
  );
  const roleEvidence = renderRoleEvidence(roleOutputs, context.evidenceRegistry, 6);

  // B18-24: Sanitize evidence span text before prompt injection
  const sanitizedClaimContext = sanitizeForPrompt(claimContext.formatted);

  const system = [
    "You are BestDel's division synthesis engine for Indian Mock Parliament research.",
    "Generate synthesis for a specific division using ONLY the evidence provided below.",
    "Every claim must be grounded in ClaimGraph claims or ClaimLedger evidence.",
    "Do not invent facts, citations, or legal holdings.",
    "Use Indian parliamentary register: direct, specific, citation-anchored.",
    `Division: ${divisionName}`,
  ].join("\n");

  const user = [
    `Agenda: ${context.agendaContract.normalizedAgenda}`,
    `User query: ${context.userQuery}`,
    "",
    `Division instructions:\n${divisionInstructions}`,
    "",
    `ClaimGraph evidence for this division (${claimContext.claimCount} claims):`,
    sanitizedClaimContext || claimContext.gapMessage || "No claims available.",
    "",
    roleEvidence ? `Role-routed evidence:\n${roleEvidence}` : "",
    "",
    context.sourceGapReport
      ? `SourceGapReport: ${context.sourceGapReport.explanation}`
      : "",
    "",
    "Generate the division output. Every major claim must cite [Source N](url).",
    "If evidence is insufficient, state it as a source gap rather than inventing content.",
  ].filter((line) => line !== undefined).join("\n");

  return {
    system,
    user,
    claimCount: claimContext.claimCount,
  };
}

function renderRoleEvidence(
  outputs: ModelRoleOutput[],
  registry: EvidenceRegistryCore,
  limit: number,
): string {
  return outputs
    .flatMap((output) =>
      output.sourceUsageMap.map((item) => ({ output, item })),
    )
    .slice(0, limit)
    .map(({ output, item }, index) => {
      const text =
        item.extractedClaim ??
        item.legalHolding ??
        item.extractedNumber ??
        item.limitation ??
        item.supportedSection ??
        "role finding";
      const cite = registry.getCitationMarkdown(item.sourceId);
      const qualify = item.confidence === "low" ? " (qualify carefully)" : "";
      return `${index + 1}. ${output.roleName}: ${sanitizeForPrompt(text)} ${cite}${qualify}`;
    })
    .join("\n");
}

/**
 * B18-24: Sanitize text for prompt injection.
 * Strips HTML tags, excessive whitespace, and truncates overly long spans.
 */
function sanitizeForPrompt(text: string): string {
  return text
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .slice(0, 2000); // Truncate excessively long text
}

function getDivisionNumber(divisionId: CanonicalDivisionId): number {
  const numbers: Record<CanonicalDivisionId, number> = {
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
  return numbers[divisionId] ?? 0;
}
