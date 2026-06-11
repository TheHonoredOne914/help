import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { ResearchMode } from "../config/research-mode.js";
import type { ClaimGraph } from "../evidence/claim-graph.js";
import { buildDivisionClaimGap, selectDivisionClaims, type EvidenceClaim } from "../evidence/claim-graph.js";
import type { EvidencePack } from "../evidence/evidence-pack-builder.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import { getTopNForPrompt } from "../evidence/evidence-ranking.js";
import type { ClaimLedger } from "../evidence/claim-ledger.js";
import type { ModelRoleOutput } from "../evidence/source-usage-map.js";
import { DIVISION_REGISTRY } from "../../lib/division-framework.js";
import { runDimensionEngine } from "../../lib/dimension-engine.js";
import type { DimensionEngineOutput } from "../../lib/types.js";
import type { SourceGapReport } from "../evidence/source-gap-report.js";
import { selectRoleOutputsForDivision } from "./role-generation/role-division-router.js";

export interface DivisionSynthesisInput {
  agendaContract: AgendaContract;
  evidenceRegistry: EvidenceRegistryCore;
  evidencePacks: EvidencePack[];
  claimGraph: ClaimGraph;
  claimLedger: ClaimLedger;
  modelRoleOutputs: ModelRoleOutput[];
  sourceGapReport?: SourceGapReport | null;
  dimensionWeights?: DimensionEngineOutput | null;
  userQuery: string;
  mode: ResearchMode;
}

export interface DivisionSynthesisResult {
  divisionOutputs: Map<string, string>;
  diagnostics: {
    divisionOrder: string[];
    instructionByDivisionId: Record<string, string>;
    claimCountByDivisionId: Record<string, number>;
    claimGraphClaimCount: number;
    discardedClaimCount: number;
  };
}

export function runDivisionSynthesisOrchestrator(input: DivisionSynthesisInput): DivisionSynthesisResult {
  const engine = input.dimensionWeights ?? runDimensionEngine(input.userQuery, "general");
  const active = DIVISION_REGISTRY
    .filter((division) => division.alwaysPresent || division.activationCondition?.(engine))
    .sort((a, b) => a.number - b.number);
  const ordered = [
    ...active.filter((division) => division.id !== "debate_utility" && division.id !== "strategic_insights"),
    ...active.filter((division) => division.id === "debate_utility"),
    ...active.filter((division) => division.id === "strategic_insights"),
  ];
  const divisionOutputs = new Map<string, string>();
  const instructionByDivisionId: Record<string, string> = {};
  const claimCountByDivisionId: Record<string, number> = {};

  for (const division of ordered) {
    const instructions = division.generateInstructions(engine);
    instructionByDivisionId[division.id] = instructions;
    const graphClaims = selectDivisionClaims(input.claimGraph, division.id, division.name);
    const claims = graphClaims.length ? graphClaims : [];
    const divisionRoleOutputs = selectRoleOutputsForDivision(`D${division.number}_${division.id}`, input.modelRoleOutputs);
    claimCountByDivisionId[division.id] = claims.length;
    const output = division.id === "debate_utility"
      ? buildDebateUtilityDivision(input, claims, divisionRoleOutputs)
      : division.id === "strategic_insights"
        ? buildStrategicInsightsDivision(input, claims, divisionOutputs, divisionRoleOutputs)
        : buildEvidenceDivision(input, division.id, division.name, instructions, claims, divisionRoleOutputs);
    divisionOutputs.set(division.id, output);
    divisionOutputs.set(`D${division.number}_${division.id}`, output);
  }

  return {
    divisionOutputs,
    diagnostics: {
      divisionOrder: ordered.map((division) => division.id),
      instructionByDivisionId,
      claimCountByDivisionId,
      claimGraphClaimCount: input.claimGraph.claims.length,
      discardedClaimCount: input.claimLedger.discardedClaims.length,
    },
  };
}

function buildEvidenceDivision(input: DivisionSynthesisInput, divisionId: string, divisionName: string, instructions: string, claims: EvidenceClaim[], roleOutputs: ModelRoleOutput[] = []): string {
  const evidence = renderClaims(input, claims, 6);
  const roleEvidence = renderRoleOutputs(input, roleOutputs, 4);
  const gap = input.sourceGapReport
    ? `\nSourceGapReport: ${input.sourceGapReport.explanation}`
    : "";
  return [
    `## ${divisionName}`,
    `Instruction basis: ${firstInstructionLine(instructions)}`,
    `Agenda: ${input.agendaContract.normalizedAgenda}.`,
    roleEvidence ? `Role routed evidence:\n${roleEvidence}` : "",
    evidence || buildDivisionClaimGap(divisionName),
    `Runtime contract: this division is rendered from ClaimLedger and EvidenceRegistry; unsupported claims become POIs, limitations, or source gaps.${gap}`,
  ].filter(Boolean).join("\n\n");
}

function buildDebateUtilityDivision(input: DivisionSynthesisInput, claims: EvidenceClaim[], roleOutputs: ModelRoleOutput[] = []): string {
  const evidence = claims.slice(0, 6);
  const roleEvidence = renderRoleOutputs(input, roleOutputs, 6);
  // BUG-19-07 FIX: Cite multiple supporting sources per claim, not just supportingSourceIds[0]
  const treasury = evidence.map((item, index) => `${index + 1}. Treasury Bench: defend legality, ministry accountability, public order, or institutional process using ${claimSourceTitle(input, item)}. ${citeMultiple(input, item.supportingSourceIds, 3)}`).join("\n");
  const opposition = evidence.map((item, index) => `${index + 1}. Opposition: challenge proportionality, rights impact, transparency, federalism, or implementation gaps using ${claimSourceTitle(input, item)}. ${citeMultiple(input, item.supportingSourceIds, 3)}`).join("\n");
  return [
    "## DIVISION 7 - DEBATE UTILITY ARSENAL",
    roleEvidence ? `Role routed evidence from parliamentary/legal/data analysts:\n${roleEvidence}` : "",
    "Treasury Bench:",
    treasury || `1. Defend only claims that have ClaimLedger support. ${fallbackCitation(input)}`,
    "Opposition:",
    opposition || `1. Convert thin evidence into a demand for disclosure rather than an invented allegation. ${fallbackCitation(input)}`,
    "POIs:",
    "1. Which exact source proves the central number or legal claim?",
    "2. Which Union ministry owns implementation and reporting?",
    "3. Where is the Supreme Court doctrine or Election Commission defence in the record?",
    "4. What federalism objection survives after the cited evidence is conceded?",
    "5. Which amendment would make the policy proportionate?",
    "Rebuttals:",
    "1. If methodology is attacked, concede limits and pivot to cross-source corroboration.",
    "2. If security is invoked, demand necessity, proportionality, and review.",
    "3. If allegations are asserted as fact, force the speaker back to registry-backed proof.",
    "Motions and amendments: propose ministry reporting, rights-impact review, time-bound committee follow-up, and a clause rejecting uncited factual assertions.",
  ].filter(Boolean).join("\n\n");
}

function buildStrategicInsightsDivision(input: DivisionSynthesisInput, claims: EvidenceClaim[], existing: Map<string, string>, roleOutputs: ModelRoleOutput[] = []): string {
  const topClaims = renderClaims(input, claims, 4);
  const roleEvidence = renderRoleOutputs(input, roleOutputs, 5);
  const d7 = existing.get("debate_utility") ?? "";
  const d7Signal = /amendment|POI|Treasury Bench|Opposition/i.test(d7) ? "D7 debate utility has usable floor tools." : "D7 debate utility remains thin and should be treated as a warning.";
  return [
    "## DIVISION 11 - STRATEGIC INSIGHTS LAYER",
    `Diagnosis: The strategic centre is whether ${input.agendaContract.normalizedAgenda} can be defended with evidence span-backed claims rather than rhetoric. ${d7Signal}`,
    `Central contradiction: Treasury Bench must convert the strongest registry-backed evidence into a lawful, accountable floor defence, while Opposition should convert weak buckets, contradictions, and missing primary proof into POIs, disclosure motions, and narrowing amendments.`,
    `Research Angle: The decisive angle is not volume of sources alone; it is which ClaimLedger-supported claims survive challenge, which claims must be qualified, and which evidence gaps should become parliamentary pressure points.`,
    `Prescription: Treasury Bench should lead with official/court/registry-backed claims; Opposition should turn weak buckets into POIs, disclosure motions, and proportionate amendments. ${fallbackCitation(input)}`,
    `Warning: Any claim without ClaimLedger support must be qualified as a source gap. Do not turn snippet-only or low-confidence material into a final proof claim.`,
    roleEvidence ? `Role routed synthesis evidence:\n${roleEvidence}` : "",
    topClaims,
  ].filter(Boolean).join("\n\n");
}

function renderClaims(input: DivisionSynthesisInput, claims: EvidenceClaim[], limit: number): string {
  return claims.slice(0, limit).map((item, index) => {
    const text = item.text;
    // BUG-19-07 FIX: Cite multiple supporting sources, not just [0]
    return `${index + 1}. ${text} ${citeMultiple(input, item.supportingSourceIds, 2)}${item.confidence === "low" || item.mustUseCarefulLanguage ? " (qualify carefully; use as context unless corroborated)" : ""}`;
  }).join("\n");
}

function citation(input: DivisionSynthesisInput, sourceId: number): string {
  return input.evidenceRegistry.getCitationMarkdown(sourceId);
}

/** BUG-19-07 FIX: Cite multiple supporting sources, filtering to eligible ones. */
function citeMultiple(input: DivisionSynthesisInput, sourceIds: number[], limit: number): string {
  const eligible = sourceIds.filter((id) => {
    const source = input.evidenceRegistry.getSource(id);
    return source?.citationEligible;
  });
  return eligible.slice(0, limit).map((id) => input.evidenceRegistry.getCitationMarkdown(id)).filter(Boolean).join(" ") || "";
}

function renderRoleOutputs(input: DivisionSynthesisInput, outputs: ModelRoleOutput[], limit: number): string {
  return outputs.flatMap((output) => output.sourceUsageMap.map((item) => ({ output, item })))
    .slice(0, limit)
    .map(({ output, item }, index) => {
      const text = item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.limitation ?? item.supportedSection ?? "role finding";
      return `${index + 1}. ${output.roleName}: ${text} ${citation(input, item.sourceId)}${item.confidence === "low" ? " (qualify carefully)" : ""}`;
    })
    .join("\n");
}

function claimSourceTitle(input: DivisionSynthesisInput, claim: EvidenceClaim): string {
  // BUG-19-07 FIX: Try all supporting sources, not just [0]
  for (const id of claim.supportingSourceIds) {
    const source = input.evidenceRegistry.getSource(id);
    if (source?.title) return source.title;
  }
  return `ClaimGraph claim ${claim.id}`;
}

// B18-43: Use relevance-ranked sources, not first available
function fallbackCitation(input: DivisionSynthesisInput): string {
  const ranked = getTopNForPrompt(input.evidenceRegistry, 1);
  return ranked.length > 0
    ? input.evidenceRegistry.getCitationMarkdown(ranked[0].id)
    : "";
}

function firstInstructionLine(instructions: string): string {
  return instructions.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? "Division registry instruction unavailable.";
}

export { runResearchPipeline } from "../pipeline/research-pipeline.js";
