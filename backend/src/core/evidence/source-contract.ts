import type { PipelineResearchMode, PipelineSourceContractMetadata } from "../pipeline/pipeline-metadata.js";

export interface EvaluateSourceContractInput {
  mode: PipelineResearchMode;
  requiredSources: number;
  citationEligibleSources: number;
  finalUniqueCitedSources: number;
  bucketCoverage?: Record<string, number>;
  requiredBuckets?: string[];
  sourceGapReport?: unknown;
  categoryScores?: Record<string, number>;
}

export function evaluateSourceContract(input: EvaluateSourceContractInput): PipelineSourceContractMetadata {
  const requiredSources = Math.max(0, input.requiredSources);
  const citationEligibleSources = Math.max(0, input.citationEligibleSources);
  const finalUniqueCitedSources = Math.max(0, input.finalUniqueCitedSources);
  const passedStrict = finalUniqueCitedSources >= requiredSources && requiredSources > 0;
  const hasSourceGapReport = Boolean(input.sourceGapReport);
  const allowsPartial = input.mode === "fast_research" || input.mode === "deep_research";
  const hasAnyEvidence = finalUniqueCitedSources > 0;
  const passedWithSourceGaps = !passedStrict && allowsPartial && hasSourceGapReport && hasAnyEvidence;
  const status = passedStrict ? "passed" : passedWithSourceGaps ? "passed_with_source_gaps" : "failed";

  return {
    requiredSources,
    citationEligibleSources,
    finalUniqueCitedSources,
    passedStrict,
    passedWithSourceGaps,
    passed: passedStrict || passedWithSourceGaps,
    status,
    reason: buildSourceContractReason({
      status,
      mode: input.mode,
      requiredSources,
      citationEligibleSources,
      finalUniqueCitedSources,
      hasSourceGapReport,
      categoryScores: input.categoryScores,
    }),
  };
}

function buildSourceContractReason(args: {
  status: PipelineSourceContractMetadata["status"];
  mode: PipelineResearchMode;
  requiredSources: number;
  citationEligibleSources: number;
  finalUniqueCitedSources: number;
  hasSourceGapReport: boolean;
  categoryScores?: Record<string, number>;
}): string {
  if (args.status === "passed") {
    return `Strict source target met: ${args.finalUniqueCitedSources}/${args.requiredSources} cited sources.`;
  }
  if (args.status === "passed_with_source_gaps") {
    const scoreNote = args.categoryScores?.sourceContract === 0
      ? " Quality scoring still records sourceContract as 0, so this is not a strict pass."
      : "";
    return `Source target partially met: ${args.finalUniqueCitedSources}/${args.requiredSources} cited sources with a SourceGapReport.${scoreNote}`;
  }
  if (!args.hasSourceGapReport && args.finalUniqueCitedSources < args.requiredSources) {
    return `Source target failed: ${args.finalUniqueCitedSources}/${args.requiredSources} cited sources and no SourceGapReport.`;
  }
  if (args.finalUniqueCitedSources === 0) {
    return "Source target failed: no cited sources were available.";
  }
  return `Source target failed: ${args.finalUniqueCitedSources}/${args.requiredSources} cited sources.`;
}
