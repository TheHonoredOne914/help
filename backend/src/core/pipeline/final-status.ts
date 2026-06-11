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
  fallbackExplicitlyAllowed?: boolean;
  degradedFallbackUsed?: boolean;
  deterministicCitedFallbackUsed?: boolean;
  visibleAnswer?: string;
}

export function decideFinalResearchStatus(input: DecideFinalResearchStatusInput): ResearchTerminalStatus {
  const citedSources = input.citationStatus?.finalUniqueCitedSources ?? input.sourceContract.finalUniqueCitedSources;
  const qualityFailed = input.qualityGate?.passed === false;
  const repairRequired = input.qualityGate?.repairRequired === true;
  const typedFatalFailure = (input.qualityGate?.fatalIssues ?? []).length > 0;
  const automaticFatalFailure = (input.qualityGate?.automaticFailures ?? []).some((failure) =>
    /\b(fatal|provider|no citations|citation validation|source contract)\b/i.test(failure)
  );
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

  // DEPLOYMENT FIX: If we have an answer with citations and source gaps, accept it even with validation issues
  if (citedSources > 0 && Boolean(input.sourceGapReport) && failedSourceUsageRoles && !automaticFatalFailure) {
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
  // Allow completion with source gaps if we have citations, even with failed source usage roles
  if (failedSourceUsageRoles && citedSources > 0 && Boolean(input.sourceGapReport)) return "completed_with_source_gaps";
  if (failedSourceUsageRoles && input.sourceContract.status !== "passed_with_source_gaps" && !sourceUsageFailuresRecoveredWithGap) return "failed";
  if (answerLooksLikeFallback && !input.legacyFallbackUsed) return "failed";

  if (input.legacyFallbackUsed) {
    if ((input.mode === "fast_research" || input.mode === "deep_research") && input.fallbackExplicitlyAllowed) {
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
