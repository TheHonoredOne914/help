/**
 * Brick 18 — Synthesis input builder.
 *
 * Builds the canonical SynthesisEngineInput from core-answer-generator data.
 * Fixes B18-42: final prompt source universe includes full registry,
 * not just evidencePacks.
 */

import type { CoreResearchAnswerInput } from "../../generation/core-answer-generator.js";
import { buildClaimLedger } from "../../evidence/claim-ledger.js";
import type { SynthesisEngineInput } from "./types.js";

/**
 * Construct a SynthesisEngineInput from the broader CoreResearchAnswerInput.
 * This centralises the translation so that the synthesis engine never needs
 * to import or understand core-answer-generator's full input shape.
 */
export function buildSynthesisEngineInput(
  coreInput: CoreResearchAnswerInput,
  modelRoleOutputs: import("../../evidence/source-usage-map.js").ModelRoleOutput[],
): SynthesisEngineInput {
  const claimLedger = coreInput.claimLedger ?? buildClaimLedger(modelRoleOutputs, coreInput.evidenceRegistry);

  return {
    requestId: coreInput.requestId,
    userQuery: coreInput.userQuery,
    mode: coreInput.mode,
    agendaContract: coreInput.agendaContract,
    evidenceRegistry: coreInput.evidenceRegistry,
    evidencePacks: coreInput.evidencePacks,
    claimGraph: coreInput.claimGraph,
    claimLedger,
    modelRoleOutputs,
    researchAngles: coreInput.researchAngles,
    sourceGapReport: coreInput.sourceGapReport,
    dimensionWeights: coreInput.dimensionWeights,
    generationMode: coreInput.generationMode,
    providerRouter: coreInput.providerRouter,
    providerName: coreInput.providerName,
    model: coreInput.model,
    providerRunState: coreInput.providerRunState,
    providerStatuses: coreInput.providerStatuses,
    autoFallback: coreInput.autoFallback,
    trustRegisteredProvidersWithoutStatus: coreInput.trustRegisteredProvidersWithoutStatus,
    providerCallTimeoutMs: coreInput.providerCallTimeoutMs,
    promptCompressionLevel: coreInput.promptCompressionLevel,
    allowSyntheticSourceUsage: coreInput.allowSyntheticSourceUsage,
    forceFinalSourceIds: coreInput.forceFinalSourceIds,
  };
}
