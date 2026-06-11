// Citation Injection Module — Brick 19
// Modular, claim-specific, evidence-grounded citation injection pipeline.

export type {
  CitationInjectionContext,
  SectionCitationPlan,
  DivisionCitationPlan,
  CounterclaimCitationEntry,
  CitationContractResult,
  CitationContractViolation,
  SourceQualityAssessment,
  CitationIdMapping,
  CitationInjectionTelemetry,
} from "./types.js";

export { enforceCitationContract } from "./citation-contract.js";
export { buildClaimCitationMap, findSourcesForClaimText } from "./claim-citation-mapper.js";
export { filterSourcesByQuality, getQualityFilteredSourceIds } from "./source-quality-filter.js";
export { selectCitationsForSection } from "./deterministic-citation-injector.js";
export { selectCitationsForSectionFromLedger } from "./section-citation-selector.js";
export { selectCitationsForDivision } from "./division-citation-selector.js";
export { buildCounterclaimCitationMap, getCounterclaimCitationMarkdown, findCounterclaimCitationViolations } from "./counterclaim-citation-map.js";
export { buildPromptCitationBlock } from "./prompt-citation-block.js";
export { resolveCitationIds, detectMergedSourceMappings } from "./citation-id-resolver.js";
export { validatePrepopulatedDivisionOutputs } from "./citation-validator-bridge.js";
export { mergeDuplicateSourceFix, preferBetterQuality, mergeTopChunks } from "./source-merge-citation-fix.js";
export { getCitationBudget, isCitationBudgetMet } from "./citation-budget.js";
export { createInjectionTelemetry, formatInjectionTelemetry } from "./telemetry.js";
