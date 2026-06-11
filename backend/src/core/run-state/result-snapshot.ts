import { serializeDivisionOutputs } from "./division-output-serializer.js";
import { normalizeCitationReport, buildSourceSnapshot } from "./source-snapshot.js";
import type { RunResultSnapshot, ResearchRunIdentity, ResearchTerminalStatus, PipelineSourceContractMetadata } from "./types.js";

export function buildResultSnapshot(input: {
  runIdentity: ResearchRunIdentity;
  finalAnswer: string;
  terminalStatus: ResearchTerminalStatus;
  errorCode?: string;
  error?: RunResultSnapshot["error"];
  sources: unknown;
  citationReport: unknown;
  sourceContract: PipelineSourceContractMetadata;
  sourceGapReport?: unknown;
  qualityGateReport?: unknown;
  repairPasses?: unknown[];
  sourceUsageValidationReports?: unknown[];
  divisionOutputs?: unknown;
  providerRuntime?: unknown;
  tokenCostUsage?: unknown;
  bucketCoverage?: Record<string, number>;
  agenda?: unknown;
  degradedFallbackUsed?: boolean;
  legacyFallbackUsed?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  fallbackCode?: string;
}): RunResultSnapshot {
  const citationReport = normalizeCitationReport(input.citationReport, input.sourceContract.citationEligibleSources);
  const sources = buildSourceSnapshot(input.sources, citationReport.citedSourceIds);
  return {
    runIdentity: input.runIdentity,
    finalAnswer: input.finalAnswer,
    terminalStatus: input.terminalStatus,
    errorCode: input.errorCode,
    error: input.error,
    sources,
    citedSourceIds: citationReport.citedSourceIds,
    citationReport,
    sourceContract: input.sourceContract,
    sourceGapReport: input.sourceGapReport,
    qualityGateReport: input.qualityGateReport,
    repairPasses: input.repairPasses ?? [],
    sourceUsageValidationReports: input.sourceUsageValidationReports ?? [],
    divisionOutputs: serializeDivisionOutputs(input.divisionOutputs),
    providerRuntime: input.providerRuntime,
    tokenCostUsage: input.tokenCostUsage,
    bucketCoverage: input.bucketCoverage,
    agenda: input.agenda,
    degradedFallbackUsed: input.degradedFallbackUsed,
    legacyFallbackUsed: input.legacyFallbackUsed,
    fallbackUsed: input.fallbackUsed,
    fallbackReason: input.fallbackReason,
    fallbackCode: input.fallbackCode,
    researchMode: input.runIdentity.researchMode,
  };
}
