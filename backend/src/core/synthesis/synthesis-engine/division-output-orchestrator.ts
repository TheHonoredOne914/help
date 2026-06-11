/**
 * Brick 18 — Division output orchestrator.
 *
 * Runs the synthesis-orchestrator and wraps its outputs into the
 * canonical single-key DivisionOutput map.
 *
 * Fixes B18-34: single canonical key per division.
 * Fixes B18-02: uses the synthesis-orchestrator which is no longer dead code.
 */

import { runDivisionSynthesisOrchestrator, type DivisionSynthesisInput } from "../synthesis-orchestrator.js";
import { DIVISION_REGISTRY } from "../../../lib/division-framework.js";
import { getDivisionNumber, normalizeToCanonicalId } from "./division-output-keying.js";
import type {
  CanonicalDivisionId,
  DivisionOutput,
  SynthesisEngineInput,
  SynthesisEngineDiagnostics,
} from "./types.js";

export interface DivisionOrchestrationResult {
  outputs: Map<CanonicalDivisionId, DivisionOutput>;
  diagnostics: SynthesisEngineDiagnostics;
}

/**
 * Run all divisions through the synthesis orchestrator, then normalise the
 * result into the canonical single-key DivisionOutput map.
 */
export function runDivisionOrchestration(input: SynthesisEngineInput): DivisionOrchestrationResult {
  const synthesisInput: DivisionSynthesisInput = {
    agendaContract: input.agendaContract,
    evidenceRegistry: input.evidenceRegistry,
    evidencePacks: input.evidencePacks,
    claimGraph: input.claimGraph,
    claimLedger: input.claimLedger,
    modelRoleOutputs: input.modelRoleOutputs,
    sourceGapReport: input.sourceGapReport,
    dimensionWeights: input.dimensionWeights,
    userQuery: input.userQuery,
    mode: input.mode,
  };

  const raw = runDivisionSynthesisOrchestrator(synthesisInput);
  const outputs = new Map<CanonicalDivisionId, DivisionOutput>();
  let fallbackCount = 0;
  let qualityFailedCount = 0;

  // Normalise into canonical single-key map
  for (const [key, text] of raw.divisionOutputs) {
    const canonicalId = normalizeToCanonicalId(key);
    if (!canonicalId || outputs.has(canonicalId)) continue; // Skip duplicates (B18-34 fix)

    const isFallback = /deterministic fallback/i.test(text) || text.trim().length < 60;
    const qualityPassed = text.trim().length >= 60 && !/^Source gap\.?$/i.test(text.trim());

    if (isFallback) fallbackCount += 1;
    if (!qualityPassed) qualityFailedCount += 1;

    outputs.set(canonicalId, {
      divisionId: canonicalId,
      divisionNumber: getDivisionNumber(canonicalId),
      text,
      isFallback,
      qualityPassed,
      qualityIssues: qualityPassed ? [] : [`Division ${canonicalId} output is too short or is a source gap placeholder.`],
      claimCount: raw.diagnostics.claimCountByDivisionId[canonicalId] ?? 0,
    });
  }

  const diagnostics: SynthesisEngineDiagnostics = {
    divisionOrder: raw.diagnostics.divisionOrder
      .map((id) => normalizeToCanonicalId(id))
      .filter((id): id is CanonicalDivisionId => id !== null),
    claimCountByDivision: raw.diagnostics.claimCountByDivisionId,
    claimGraphClaimCount: raw.diagnostics.claimGraphClaimCount,
    discardedClaimCount: raw.diagnostics.discardedClaimCount,
    fallbackDivisionCount: fallbackCount,
    qualityFailedDivisionCount: qualityFailedCount,
  };

  return { outputs, diagnostics };
}

/**
 * Format division outputs as a context block for inclusion in the final
 * answer prompt. This is the critical B18-01 fix: division context is
 * available to the final model.
 */
export function formatDivisionContextForPrompt(
  outputs: Map<CanonicalDivisionId, DivisionOutput>,
  maxCharsPerDivision = 1200,
): string {
  const sections: string[] = [];

  for (const [id, output] of outputs) {
    if (!output.text.trim()) continue;
    let truncated = output.text.length > maxCharsPerDivision
      ? `${output.text.slice(0, maxCharsPerDivision).trimEnd()}…`
      : output.text;
    if (truncated.endsWith("…")) {
      truncated = truncated.replace(/\[Source\s+\d+\](?:\([^)]*)?…$/, "…");
    }
    sections.push(`[D${output.divisionNumber} ${id}]\n${truncated}`);
  }

  if (sections.length === 0) return "";

  return [
    "DIVISION SYNTHESIS CONTEXT (D1-D11):",
    "The following division outputs were generated from ClaimGraph, ClaimLedger, and role model outputs.",
    "Use them as synthesis context — do not repeat them verbatim.",
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n");
}
