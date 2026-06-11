/**
 * Brick 18 — Synthesis Engine public API.
 */

// Phase 1 — Orchestration
export { runSynthesisEngine } from "./run-synthesis-engine.js";
export { buildSynthesisEngineInput } from "./synthesis-input-builder.js";
export { runDivisionOrchestration, formatDivisionContextForPrompt } from "./division-output-orchestrator.js";
export { getDivisionNumber, normalizeToCanonicalId, buildTextMapFromOutputs } from "./division-output-keying.js";

// Phase 2 — Division synthesis
export { synthesizeDivision } from "./division-model-synthesizer.js";
export { synthesizeDebateUtility } from "./d7-debate-utility-synthesizer.js";
export { synthesizeStrategicInsights } from "./d11-strategic-synthesis-synthesizer.js";
export { buildDivisionPrompt } from "./division-prompt-builder.js";
export { validateDivisionOutput, validateAllDivisionOutputs } from "./division-quality-gate.js";
export { buildClaimContextForDivision, getClaimCapForDivision } from "./claim-context-builder.js";

// Phase 4 — Prompt budget & evidence context
export { checkPromptBudget, getCompressionPriority, postForcedSourceBudgetCheck } from "./prompt-budget-protector.js";
export { buildEvidenceContext, getCorroboratingCitations } from "./evidence-context-builder.js";

// Phase 5 — Repair & role routing
export { runSynthesisRepair } from "./synthesis-repair-orchestrator.js";
export { getRolesForDivision, selectRoleOutputsForDivisionEngine, extractRoleIntelligence } from "./role-output-router.js";

// Phase 6 — Guards & fallbacks
export { isLegacySynthesisAllowed, assertLegacySynthesisAllowed, isSyntheticSourceAllowed } from "./legacy-synthesis-guard.js";
export { buildDeterministicSynthesisFallback } from "./deterministic-synthesis-fallback.js";

// Types
export type {
  CanonicalDivisionId,
  DivisionOutput,
  SynthesisEngineInput,
  SynthesisEngineResult,
  SynthesisEngineDiagnostics,
} from "./types.js";
