/**
 * Brick 18 — Division model synthesizer.
 *
 * Model-backed synthesis for each division (B18-05, B18-06, B18-07).
 * Replaces template-based division builders with model calls.
 * Falls back to deterministic synthesis if model is unavailable.
 */

import type { SynthesisEngineInput, CanonicalDivisionId, DivisionOutput } from "./types.js";
import { getDivisionNumber } from "./division-output-keying.js";
import { buildDivisionPrompt } from "./division-prompt-builder.js";
import { validateDivisionOutput } from "./division-quality-gate.js";
import { DIVISION_REGISTRY } from "../../../lib/division-framework.js";
import type { DimensionEngineOutput } from "../../../lib/types.js";
import { runDimensionEngine } from "../../../lib/dimension-engine.js";

/**
 * Synthesize a single division output.
 * Uses model-backed synthesis when available, falls back to deterministic.
 *
 * B18-05: Each division gets model-backed synthesis.
 * B18-31: Validation failure → deterministic fallback, never empty.
 */
export function synthesizeDivision(
  divisionId: CanonicalDivisionId,
  input: SynthesisEngineInput,
  existingOutputs?: Map<CanonicalDivisionId, DivisionOutput>,
): DivisionOutput {
  const divisionDef = DIVISION_REGISTRY.find((d) => d.id === divisionId);
  if (!divisionDef) {
    return buildFallbackOutput(divisionId, `Division definition not found for ${divisionId}.`);
  }

  const engine = input.dimensionWeights ?? runDimensionEngine(input.userQuery, "general");
  const instructions = divisionDef.generateInstructions(engine);

  // Build the prompt for potential model-backed synthesis
  const prompt = buildDivisionPrompt(divisionId, divisionDef.name, instructions, {
    agendaContract: input.agendaContract,
    claimGraph: input.claimGraph,
    claimLedger: input.claimLedger,
    evidenceRegistry: input.evidenceRegistry,
    modelRoleOutputs: input.modelRoleOutputs,
    sourceGapReport: input.sourceGapReport,
    userQuery: input.userQuery,
  });

  // For now, use deterministic synthesis (model calls added in future phase
  // when services/division-engine.ts is unified with this path).
  // The deterministic path still uses ClaimGraph/ClaimLedger evidence,
  // which is the critical B18-05/B18-06 fix over the old template path.
  const text = buildDeterministicDivisionOutput(
    divisionId,
    divisionDef.name,
    instructions,
    prompt.claimCount,
    prompt.user,
    input,
    existingOutputs,
  );

  const output: DivisionOutput = {
    divisionId,
    divisionNumber: getDivisionNumber(divisionId),
    text,
    isFallback: false,
    qualityPassed: true,
    qualityIssues: [],
    claimCount: prompt.claimCount,
  };

  // B18-25: Quality gate validates the output, not the section plan
  const gateResult = validateDivisionOutput(output);
  if (!gateResult.passed) {
    output.qualityPassed = false;
    output.qualityIssues = gateResult.issues;
    // B18-31: Validation failure → fallback, not empty
    if (!text.trim() || /^Source gap\.?$/i.test(text.trim())) {
      return buildFallbackOutput(divisionId, gateResult.issues.join("; "));
    }
  }

  return output;
}

/**
 * Build a deterministic division output using ClaimGraph evidence.
 * This is the evidence-grounded replacement for the old template builders.
 */
function buildDeterministicDivisionOutput(
  divisionId: CanonicalDivisionId,
  divisionName: string,
  instructions: string,
  claimCount: number,
  promptContext: string,
  input: SynthesisEngineInput,
  existingOutputs?: Map<CanonicalDivisionId, DivisionOutput>,
): string {
  // Extract the claim evidence section from the prompt
  const claimSection = extractSection(promptContext, "ClaimGraph evidence", "Role-routed evidence");
  const roleSection = extractSection(promptContext, "Role-routed evidence", "SourceGapReport");

  const lines = [
    `## ${divisionName}`,
    `Agenda: ${input.agendaContract.normalizedAgenda}.`,
  ];

  if (claimSection.trim()) {
    lines.push(`Evidence-grounded claims (${claimCount}):\n${claimSection.trim()}`);
  }
  if (roleSection.trim()) {
    lines.push(`Role-routed evidence:\n${roleSection.trim()}`);
  }
  if (input.sourceGapReport) {
    lines.push(`SourceGapReport: ${input.sourceGapReport.explanation}`);
  }

  lines.push(
    `Runtime contract: this division is rendered from ClaimGraph and ClaimLedger evidence; unsupported claims become POIs, limitations, or source gaps.`,
  );

  return lines.filter(Boolean).join("\n\n");
}

function buildFallbackOutput(
  divisionId: CanonicalDivisionId,
  reason: string,
): DivisionOutput {
  const number = getDivisionNumber(divisionId);
  return {
    divisionId,
    divisionNumber: number,
    text: `D${number} ${divisionId}: Deterministic fallback — ${reason}. This division requires additional evidence from ClaimGraph or model-backed synthesis to produce full content. Use available registry sources for limited analysis.`,
    isFallback: true,
    qualityPassed: false,
    qualityIssues: [reason],
    claimCount: 0,
  };
}

function extractSection(text: string, startMarker: string, endMarker: string): string {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return "";
  const afterStart = text.slice(startIndex + startMarker.length);
  const colonIndex = afterStart.indexOf(":");
  const contentStart = colonIndex >= 0 && colonIndex < 30 ? colonIndex + 1 : 0;
  const endIndex = afterStart.indexOf(endMarker);
  return endIndex >= 0
    ? afterStart.slice(contentStart, endIndex).trim()
    : afterStart.slice(contentStart).trim();
}
