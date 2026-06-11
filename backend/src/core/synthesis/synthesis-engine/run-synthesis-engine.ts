/**
 * Brick 18 — Synthesis Engine entry point.
 *
 * Fixes B18-01: Division synthesis runs BEFORE final answer generation,
 * so the final model can see D1-D11 outputs.
 * Fixes B18-02: buildDivisionOutputs() is no longer dead code — division
 * orchestration is the canonical path.
 * Fixes B18-08: Division outputs are injected as context into the final prompt.
 */

import { runDivisionOrchestration, formatDivisionContextForPrompt } from "./division-output-orchestrator.js";
import { buildTextMapFromOutputs } from "./division-output-keying.js";
import type {
  SynthesisEngineInput,
  SynthesisEngineResult,
} from "./types.js";

/**
 * Run the full synthesis engine:
 * 1. Generate D1-D11 division outputs from ClaimGraph, ClaimLedger, and role outputs.
 * 2. Format them as context for the final answer prompt.
 * 3. Return structured outputs and a text context block.
 *
 * The caller (core-answer-generator) must inject `divisionContext` into
 * the final answer prompt BEFORE calling the model.
 */
export function runSynthesisEngine(input: SynthesisEngineInput): SynthesisEngineResult {
  const { outputs, diagnostics } = runDivisionOrchestration(input);
  const divisionContext = formatDivisionContextForPrompt(outputs);
  const divisionTextMap = buildTextMapFromOutputs(outputs);

  return {
    divisionOutputs: outputs,
    divisionTextMap,
    divisionContext,
    diagnostics,
  };
}
