import type { PipelineMetadata } from "../pipeline/pipeline-metadata.js";
import type { RunResultSnapshot } from "./types.js";

export function buildPipelineMetadataFromSnapshot(snapshot: RunResultSnapshot): PipelineMetadata {
  return {
    runId: snapshot.runIdentity.runId,
    requestId: snapshot.runIdentity.requestId,
    conversationId: snapshot.runIdentity.conversationId,
    assistantMessageId: snapshot.runIdentity.assistantMessageId ?? "",
    queryHash: snapshot.runIdentity.queryHash,
    researchMode: snapshot.runIdentity.researchMode as PipelineMetadata["researchMode"],
    terminalStatus: snapshot.terminalStatus,
    coreGenerationUsed: snapshot.legacyFallbackUsed !== true,
    legacyFallbackUsed: snapshot.legacyFallbackUsed === true,
    liveRetrievalUsed: true,
    sourceContract: snapshot.sourceContract,
    sourceGapReport: snapshot.sourceGapReport,
    qualityGate: snapshot.qualityGateReport as PipelineMetadata["qualityGate"],
    qualityGateReport: snapshot.qualityGateReport,
    citationStatus: snapshot.citationReport,
    citationReport: snapshot.citationReport,
    sourceUsageValidationReports: snapshot.sourceUsageValidationReports,
    repairPasses: snapshot.repairPasses,
    divisionOutputs: snapshot.divisionOutputs,
    degradedFallbackUsed: snapshot.degradedFallbackUsed,
    fallbackUsed: snapshot.fallbackUsed,
    fallbackReason: snapshot.fallbackReason,
    fallbackCode: snapshot.fallbackCode,
    providerRuntime: snapshot.providerRuntime as PipelineMetadata["providerRuntime"],
    tokenCostUsage: snapshot.tokenCostUsage,
    bucketCoverage: snapshot.bucketCoverage,
    agenda: snapshot.agenda,
    error: snapshot.error,
    sources: snapshot.sources,
  };
}
