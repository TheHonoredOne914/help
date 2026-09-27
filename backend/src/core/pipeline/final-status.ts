import type { PipelineResearchMode, PipelineSourceContractMetadata, ResearchTerminalStatus } from "./pipeline-metadata.js";

export interface FinalStatusQualityGate {
  passed?: boolean;
  score?: number;
  repairRequired?: boolean;
  automaticFailures?: string[];
  fatalIssues?: string[];
  categoryScores?: Record<string, number>;
}

export interface FinalStatusCitationStatus {
  finalUniqueCitedSources?: number;
}

export interface DecideFinalResearchStatusInput {
  mode: PipelineResearchMode;
  coreGenerationUsed: boolean;
  legacyFallbackUsed: boolean;
  sourceContract: PipelineSourceContractMetadata;
  sourceGapReport?: unknown;
  qualityGate?: FinalStatusQualityGate | null;
  citationStatus?: FinalStatusCitationStatus | null;
  providerError?: unknown;
  sourceUsageFailureReports?: unknown[];
  /** When false, SourceUsageMap union missed the floor (e.g. 39/40) even if rolesFailed=0. */
  sourceUsagePassed?: boolean;
  fallbackExplicitlyAllowed?: boolean;
  degradedFallbackUsed?: boolean;
  deterministicCitedFallbackUsed?: boolean;
  visibleAnswer?: string;
}

/** Mode-depth and length fatals are coverage gaps, not safety failures. */
function isNonSafetyDepthFatal(issue: string): boolean {
  if (/source_gap_bypass|hallucination|legal_accuracy|electoral|parliament_framing|claim_grounding|claim grounding|unsupported_high_risk|unsupported citation|citation validation|fake citation|template_or_thin|agenda_drift|fraud/i.test(issue)) {
    return false;
  }
  return /\bmode_depth\b|\bfinal_answer_too_short\b|\bfinal_answer_too_long\b/i.test(issue);
}

function hasSafetyValidationFailure(input: DecideFinalResearchStatusInput): boolean {
  const fatalIssues = input.qualityGate?.fatalIssues ?? [];
  if (fatalIssues.some((issue) => !isNonSafetyDepthFatal(issue))) return true;
  return (input.qualityGate?.automaticFailures ?? []).some((failure) =>
    !isNonSafetyDepthFatal(failure)
    && /\b(fatal|provider|no citations|citation validation|source contract|hallucination|legal|electoral|framing|claim grounding|unsupported citation|electoral_integrity|parliament_framing|legal_accuracy|template_or_thin)\b/i.test(failure)
  );
}

export function decideFinalResearchStatus(input: DecideFinalResearchStatusInput): ResearchTerminalStatus {
  const citedSources = input.citationStatus?.finalUniqueCitedSources ?? input.sourceContract.finalUniqueCitedSources;
  const qualityFailed = input.qualityGate?.passed === false;
  const repairRequired = input.qualityGate?.repairRequired === true;
  const typedFatalFailure = (input.qualityGate?.fatalIssues ?? []).some((issue) => !isNonSafetyDepthFatal(issue));
  const safetyValidationFailed = hasSafetyValidationFailure(input);
  const automaticFatalFailure = safetyValidationFailed;
  const failedSourceUsageRoles = (input.sourceUsageFailureReports ?? []).length > 0;
  const answerLooksLikeFallback = Boolean(input.visibleAnswer && /\bLegacy fallback answer retained|Research Incomplete|Core generation could not produce/i.test(input.visibleAnswer));
  const sourceUsageFailuresRecoveredWithGap =
    failedSourceUsageRoles
    && input.deterministicCitedFallbackUsed === true
    && Boolean(input.sourceGapReport)
    && citedSources > 0
    && !automaticFatalFailure
    && !answerLooksLikeFallback;

  if (input.providerError) {
    return input.degradedFallbackUsed ? "legacy_fallback_used" : "provider_error";
  }

  // No citations = always fail
  if (citedSources === 0) return "failed";

  // SourceUsageMap near-miss (e.g. 39/40): roles may all pass, so failureReports is empty, but
  // aggregate.passed is false and a SourceGapReport was built. Prefer completed_with_source_gaps
  // before the strictCompleted shortcut (smoke rejects completed + usage.passed=false).
  if (
    citedSources > 0
    && Boolean(input.sourceGapReport)
    && input.sourceUsagePassed === false
    && input.coreGenerationUsed
    && !input.legacyFallbackUsed
    && !safetyValidationFailed
    && !answerLooksLikeFallback
  ) {
    return "completed_with_source_gaps";
  }

  // Source-gap recovery: fewer sources than the mode wants — not a license to skip safety validation.
  if (citedSources > 0 && Boolean(input.sourceGapReport) && failedSourceUsageRoles && !safetyValidationFailed) {
    return "completed_with_source_gaps";
  }

  if (input.degradedFallbackUsed && citedSources > 0) return "legacy_fallback_used";
  if (typedFatalFailure) return "failed";
  if (input.sourceContract.status === "failed") return "failed";

  const strictCompleted =
    input.coreGenerationUsed === true
    && input.legacyFallbackUsed === false
    && input.qualityGate?.passed === true
    && input.qualityGate?.repairRequired !== true
    && input.sourceContract.passedStrict === true
    && citedSources >= input.sourceContract.requiredSources
    && !automaticFatalFailure
    && !failedSourceUsageRoles
    && input.sourceUsagePassed !== false
    && !answerLooksLikeFallback;

  if (strictCompleted) return "completed";

  if (
    input.deterministicCitedFallbackUsed
    && input.coreGenerationUsed === true
    && input.legacyFallbackUsed === false
    && input.sourceContract.passed === true
    && citedSources > 0
    && !automaticFatalFailure
    && (!failedSourceUsageRoles || sourceUsageFailuresRecoveredWithGap)
    && !answerLooksLikeFallback
  ) {
    return "completed_with_source_gaps";
  }

  if (repairRequired && input.sourceContract.status !== "passed_with_source_gaps") return "failed";
  if (qualityFailed && input.sourceContract.status !== "passed_with_source_gaps") return "failed";
  if (qualityFailed && automaticFatalFailure) return "failed";
  // Allow completion with source gaps if we have citations and no safety validation failures
  if (failedSourceUsageRoles && citedSources > 0 && Boolean(input.sourceGapReport) && !safetyValidationFailed) return "completed_with_source_gaps";
  if (failedSourceUsageRoles && input.sourceContract.status !== "passed_with_source_gaps" && !sourceUsageFailuresRecoveredWithGap) return "failed";
  if (answerLooksLikeFallback && !input.legacyFallbackUsed) return "failed";

  if (input.legacyFallbackUsed) {
    const fullDepthContract = input.sourceContract.requiredSources > 20;
    if (
      (input.mode === "fast_research" || input.mode === "deep_research")
      && input.fallbackExplicitlyAllowed
      && !fullDepthContract
    ) {
      return "legacy_fallback_used";
    }
    return "failed";
  }

  // FIX 1: Hard rule — completed_with_source_gaps requires citations > 0
  // Research modes that can use source gap answers: fast_research, web_search, deep_research
  if (input.sourceContract.status === "passed_with_source_gaps") {
    if (
      Boolean(input.sourceGapReport)
      && citedSources > 0
      && !automaticFatalFailure
    ) {
      return "completed_with_source_gaps";
    }
    // If source gaps exist but citations === 0, must fail (invalid state)
    if (citedSources === 0 && Boolean(input.sourceGapReport)) {
      return "failed";  // or degraded_fallback if repair was attempted
    }
    return "failed";
  }

  return "failed";
}
