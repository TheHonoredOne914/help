import type { CoreResearchAnswerInput } from "../../generation/core-answer-generator.js";
import type { CitationRepairContext } from "./types.js";

/**
 * Brick 20: Repair context builder.
 * Merges all intelligence artifacts needed for high-fidelity citation repair.
 */
export function buildCitationRepairContext(
  input: CoreResearchAnswerInput,
  divisionOutputs?: Map<any, any>
): CitationRepairContext {
  // Extract source gap report from input. If undefined, set to null.
  const sourceGapReport = input.sourceGapReport ?? null;

  return {
    agendaContract: input.agendaContract,
    evidencePacks: input.evidencePacks,
    claimLedger: input.claimLedger ?? { items: [], summary: { itemCount: 0, sourceCount: 0, citationCreditEligibleCount: 0, lowConfidenceCount: 0, roles: [] }, discardedClaims: [] },
    claimGraph: input.claimGraph ?? { claims: [] },
    sourceUsageMaps: input.sourceUsageMaps,
    sourceGapReport,
    divisionOutputs,
    registry: input.evidenceRegistry,
  };
}
