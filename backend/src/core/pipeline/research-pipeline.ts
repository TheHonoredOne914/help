import { buildAgendaContract, type AgendaContract } from "../agenda/agenda-contract.js";
import { isArchiveContextSafeForAgenda } from "../agenda/archive-safety.js";
import { routeQueryAgainstWorkspace, type QueryRoutingResult } from "../archive/context-router.js";
import { generateResearchAngles, type ResearchAngle } from "../archive/research-angle-engine.js";
import { agendaOutputDepthForMode, inferResearchMode, type ResearchMode } from "../config/research-mode.js";
import { getSourceUsagePolicy } from "../config/source-usage-policy.js";
import { generateCoreResearchAnswer, type CoreResearchAnswerResult } from "../generation/core-answer-generator.js";
import { buildClaimGraph, buildLegacyClaimGraphContext, type ClaimGraph } from "../evidence/claim-graph.js";
import { buildEvidencePacks, type EvidenceCard } from "../evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources, markdownCitationUrl, type EvidenceRegistryCore, type EvidenceSource } from "../evidence/evidence-registry.js";
import { buildSourceGapReport, type SourceFilterRejectionDiagnostic, type SourceGapReport } from "../evidence/source-gap-report.js";
import { buildClaimLedger, type ClaimLedger } from "../evidence/claim-ledger.js";
import { toEvidenceCard } from "../evidence/evidence-pack/evidence-card-adapter.js";
import { buildBucketedQueryPlanWithExpansion } from "../retrieval/query-planner.js";
import { runBucketedRetrieval, type BucketedRetrievalOptions } from "../retrieval/bucketed-retrieval.js";
import { filterSourcesForAgenda } from "../retrieval/source-filter.js";
import { validateCitations, type CitationValidationReport } from "../verification/citation-validator.js";
import { runThesisQualityGate, type QualityGateReport } from "../verification/thesis-quality-gate.js";
import type { ModelRoleOutput } from "../evidence/source-usage-map.js";
import { aggregateSourceUsageValidation, type SourceUsageAggregateRoleValidation } from "../evidence/source-usage/index.js";
import { evaluateSourceContract } from "../evidence/source-contract.js";
import { getHealthyGenerationProviders, runModelRoleForSourceUsage } from "../synthesis/model-role-runner.js";
import { selectCardsForRole } from "../synthesis/role-generation/role-card-selector.js";
import type { ProviderName } from "../providers/provider-types.js";
import type { ProviderRouter } from "../providers/provider-router.js";
import { createProviderRunState, type ProviderRunState } from "../providers/provider-run-state.js";
import type { ProviderResearchStatus } from "../providers/provider-health.js";
import {
  buildResearchModelPlan,
  getResearchModelAssignment,
  SOURCE_USAGE_RESEARCH_ROLES,
  type ResearchModelPlan,
} from "../providers/model-strategy.js";
import { makePipelineEvent, type PipelineEvent } from "./pipeline-events.js";
import { createLatencyBudget, type LatencyBudgetManager } from "../latency/latency-budget.js";
import { decideRunTerminalStatus } from "../run-state/terminal-status-decider.js";
import { runDimensionEngine } from "../../lib/dimension-engine.js";
import type { CommitteeType } from "../../lib/types.js";

export type { SourceGapReport } from "../evidence/source-gap-report.js";

export interface ResearchPipelineInput {
  runId?: string;
  requestId?: string;
  conversationId?: number | string;
  assistantMessageId?: number | string;
  userQuery: string;
  mode: ResearchMode;
  archiveText?: string;
  preloadedSources?: Array<Partial<EvidenceSource> & { excerpt?: string }>;
  liveRetrieval?: boolean;
  allowMockRetrieval?: boolean;
  searchOptions?: BucketedRetrievalOptions;
  emit?: (event: PipelineEvent) => void;
  useCoreGeneration?: boolean;
  generationMode?: "model" | "deterministic";
  allowSyntheticSourceUsage?: boolean;
  providerRouter?: ProviderRouter;
  providerName?: ProviderName;
  model?: string;
  providerRunState?: ProviderRunState;
  providerStatuses?: ProviderResearchStatus[];
  autoFallback?: boolean;
  onStream?: (chunk: string) => void;
  userSelectedModels?: string[];
  researchModelPlan?: ResearchModelPlan;
  signal?: AbortSignal;
  trustRegisteredProvidersWithoutStatus?: boolean;
  emergencyCompatibilityMode?: boolean;
  forceCoreGenerationFailure?: boolean;
  legacyFallback?: (input: { agendaContract: AgendaContract; evidenceRegistry: EvidenceRegistryCore; sourceGapReport: SourceGapReport | null }) => Promise<string>;
}

export interface ResearchPipelineResult {
  agendaContract: AgendaContract;
  evidenceRegistry: EvidenceRegistryCore;
  modelRoleOutputs: ModelRoleOutput[];
  sourceUsageAggregate: SourceUsageAggregateResult;
  citationReport: CitationValidationReport;
  qualityGate: QualityGateReport;
  sourceGapReport: SourceGapReport | null;
  finalAnswer: string;
  usedCoreGeneration: boolean;
  usedLegacyFallback: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  fallbackCode?: "compatibility_fallback" | "explicit_legacy_fallback" | "deterministic_generation_mode" | "unexpected_generation_failure";
  originalFailureType?: "generation_failure" | "provider_error" | "retrieval_failure";
  // Enhanced fallback truthfulness (Phase 1 fix)
  degradedState?: {
    severity: "none" | "degraded" | "partial" | "failed";
    affectedCapabilities: string[];
    originalError?: string;
    recoveredWith?: string;
  };
  archiveRouting: QueryRoutingResult | null;
  researchAngles: ResearchAngle[];
  divisionOutputs: Map<string, string>;
  terminalStatus: import("./pipeline-metadata.js").ResearchTerminalStatus;
  coreAnswerResult?: CoreResearchAnswerResult;
}

export interface SourceUsageAggregateResult {
  outputs: ModelRoleOutput[];
  failureReports: NonNullable<ModelRoleOutput["sourceUsageFailureReport"]>[];
  validUsageCount: number;
  validUsedSourceIds: number[];
  rolesPassed: number;
  rolesFailed: number;
  warningRoleCount: number;
  passed: boolean;
  completedWithSourceGaps: boolean;
  perRoleValidation?: SourceUsageAggregateRoleValidation[];
  strongSourceCount?: number;
  mediumSourceCount?: number;
  weakSourceCount?: number;
  snippetSourceCount?: number;
  invalidSourceCount?: number;
}

export interface SourceUsageExecutionModeResolution {
  mode: "model" | "deterministic";
  reason: string;
  healthyProviderCount: number;
}

export async function runResearchPipeline(input: ResearchPipelineInput): Promise<ResearchPipelineResult> {
  const requestId = input.requestId ?? `pipeline_${Date.now().toString(36)}`;

  // Validate query input before proceeding
  const trimmedQuery = input.userQuery?.trim();
  if (!trimmedQuery) {
    throw new Error("ResearchPipeline: userQuery is empty or whitespace-only");
  }
  const MAX_QUERY_LENGTH = 10_000;
  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    throw new Error(`ResearchPipeline: userQuery exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
  }
  const normalizedUserQuery = trimmedQuery.replace(/\s+/g, " ");

  const mode = inferResearchMode(normalizedUserQuery, input.mode);
  const latencyBudget = createLatencyBudget(mode);
  const emit = (type: PipelineEvent["type"], data: Record<string, unknown> = {}) => input.emit?.(makePipelineEvent(type, requestId, {
    runId: input.runId,
    conversationId: input.conversationId,
    assistantMessageId: input.assistantMessageId,
    effectiveResearchMode: mode,
    researchMode: mode,
    mode,
    ...data,
  }));
  let terminalEmitted = false;
  const emitTerminal = (status: "completed" | "completed_with_source_gaps" | "degraded_fallback" | "provider_error" | "failed" | "cancelled" | "legacy_fallback_used", data: Record<string, unknown> = {}) => {
    if (terminalEmitted) return;
    terminalEmitted = true;
    emit(status, { terminalStatus: status, done: true, ...data });
  };
  const throwIfAborted = () => {
    if (!input.signal?.aborted) return;
    emitTerminal("cancelled", { reason: "request aborted" });
    throw abortError();
  };
  const flushLatencyEvents = () => {
    while (latencyBudget.events.length > 0) {
      const event = latencyBudget.events.shift()!;
      emit(event.type, event.data);
    }
  };
  emit("request_received", { mode });
  throwIfAborted();
  const providerRunState = input.providerRunState ?? createProviderRunState();
  const researchModelPlan = input.researchModelPlan ?? buildResearchModelPlan({
    runId: input.runId ?? requestId,
    mode,
    userSelectedModels: input.userSelectedModels ?? (input.providerName && input.model ? [`${input.providerName}/${input.model}`] : []),
    selected: input.providerName && input.model ? { providerName: input.providerName, model: input.model } : undefined,
    providerStatuses: input.providerStatuses,
    autoFallback: input.autoFallback === true,
  });
  emit("model_plan_validated", {
    assignments: researchModelPlan.assignments.map((assignment) => ({
      role: assignment.role,
      providerName: assignment.providerName,
      model: assignment.model,
      selectionSource: assignment.selectionSource,
      fallbackPolicy: assignment.fallbackPolicy,
      generationEligible: assignment.generationEligible,
      blockedReason: assignment.blockedReason,
      fallbackFrom: assignment.fallbackFrom,
    })),
    warnings: researchModelPlan.warnings,
  });
  let fallbackReason: string | undefined;
  let fallbackCode: ResearchPipelineResult["fallbackCode"] | undefined;
  let originalFailureType: ResearchPipelineResult["originalFailureType"] | undefined;

  const agendaContract = buildAgendaContract({ requestId, originalUserQuery: normalizedUserQuery, outputDepth: agendaOutputDepthForMode(mode) });
  applyModeSourceTargets(agendaContract, mode);
  emit("agenda_contract_created", { topicType: agendaContract.topicType, minimumUniqueCitedSources: agendaContract.minimumUniqueCitedSources });
  const dimensionWeights = runDimensionEngine(normalizedUserQuery, inferCommitteeType(normalizedUserQuery, agendaContract));
  emit("dimension_engine_completed", {
    primary: dimensionWeights.primaryDimensions.map((dimension) => dimension.name),
    secondary: dimensionWeights.secondaryDimensions.map((dimension) => dimension.name),
  });

  const archiveSafety = isArchiveContextSafeForAgenda(input.archiveText ?? "", agendaContract);
  emit("archive_safety_checked", { safe: archiveSafety.safe, driftRisk: archiveSafety.driftRisk });
  const archiveRouting = input.archiveText
    ? routeQueryAgainstWorkspace(normalizedUserQuery, { title: "Active archive", summary: archiveSafety.safe ? input.archiveText : "" })
    : null;
  if (archiveRouting) emit("archive_routing_completed", { relationType: archiveRouting.relationType, suggestedAction: archiveRouting.suggestedAction, shouldAskUser: archiveRouting.shouldAskUser });

  const researchAngles = generateResearchAngles({ agendaContract, archiveRouting });
  emit("research_angles_generated", { count: researchAngles.length });

  const retrievalCritic = getResearchModelAssignment(researchModelPlan, "retrieval_critic");
  const queryPlan = await buildBucketedQueryPlanWithExpansion(agendaContract, mode, retrievalCritic?.generationEligible && input.providerRouter
    ? {
        providerRouter: input.providerRouter as any,
        providerName: retrievalCritic.providerName,
        model: retrievalCritic.model,
      }
    : {});
  emit("source_bucket_plan_created", { buckets: queryPlan.buckets.length, queries: queryPlan.queries.length, telemetry: queryPlan.queryTelemetry?.length ?? 0 });

  latencyBudget.startStage("retrieval");
  flushLatencyEvents();
  throwIfAborted();
  const rawSources = input.preloadedSources ?? await retrieveLiveSourcesIfNeeded(input, mode, queryPlan, emit, latencyBudget);
  throwIfAborted();
  latencyBudget.endStage("retrieval");
  flushLatencyEvents();
  const filterResult = filterSourcesForAgenda(rawSources.map((source) => ({
    ...source,
    url: source.url ?? "",
    title: source.title ?? "",
    snippet: source.snippet ?? source.excerpt ?? "",
  })), agendaContract, { withReasons: true });
  const filtered = filterResult.kept;
  const filterRejections = toFilterRejectionDiagnostics(filterResult.rejected);
  emit("source_filter_completed", {
    input: rawSources.length,
    kept: filtered.length,
    rejected: filterRejections.length,
    rejectionReasons: countRejectionReasons(filterRejections),
  });

  const evidenceRegistry = buildEvidenceRegistryFromSources(filtered as any, agendaContract);
  emit("evidence_registry_created", { citationEligible: evidenceRegistry.getCitationEligibleCount(), bucketCoverage: evidenceRegistry.getBucketCoverage() });

  const packsById = buildEvidencePacks(evidenceRegistry, agendaContract, { query: normalizedUserQuery, mode });
  const evidencePacks = Object.values(packsById);
  emit("evidence_pack_created", { packs: evidencePacks.length });

  let claimGraph = buildClaimGraph(evidenceRegistry, agendaContract, { evidencePacks, mode });
  emit("claim_graph_created", { claims: claimGraph.claims.length, phase: "pre_source_usage" });

  let sourceGapReport = buildSourceGapReport(
    agendaContract,
    evidenceRegistry,
    queryPlan.queries.map((query) => query.query),
    [],
    [],
    filterRejections,
  );
  if (sourceGapReport) emit("source_gap_report_created", { availableCitationEligibleSources: sourceGapReport.availableCitationEligibleSources });

  const sourceUsageRun = await runSourceUsageRoles({
    input,
    mode,
    agendaContract,
    evidenceRegistry,
    packsById,
    claimGraph,
    sourceGapReport,
    emit,
    latencyBudget,
    providerRunState,
    researchModelPlan,
  });
  const modelRoleOutputs = sourceUsageRun.outputs;
  const sourceUsageAggregate = sourceUsageRun.aggregate;
  sourceGapReport = sourceGapReport ?? buildSourceUsageGapReport(
    agendaContract,
    evidenceRegistry,
    sourceUsageAggregate,
    getSourceUsagePolicy(mode),
    queryPlan.queries.map((query) => query.query),
    filterRejections,
  );
  if (sourceGapReport) emit("source_gap_report_created", {
    availableCitationEligibleSources: sourceGapReport.availableCitationEligibleSources,
    failedBuckets: sourceGapReport.failedBuckets,
    weakBuckets: sourceGapReport.weakBuckets,
  });
  const claimLedger: ClaimLedger = buildClaimLedger(modelRoleOutputs, evidenceRegistry, sourceUsageAggregate.validUsedSourceIds);
  emit("source_usage_map_created", { roles: modelRoleOutputs.length });
  claimGraph = buildClaimGraph(evidenceRegistry, agendaContract, {
    evidencePacks,
    modelRoleOutputs,
    sourceUsageAggregate,
    mode,
  });
  emit("claim_graph_created", {
    claims: claimGraph.claims.length,
    counterclaims: claimGraph.counterclaims?.length ?? 0,
    contradictions: claimGraph.contradictions?.length ?? 0,
    phase: "post_source_usage",
  });

  const useCoreGeneration = input.useCoreGeneration ?? process.env.USE_CORE_GENERATION !== "false";
  const compatibilityMode = input.emergencyCompatibilityMode ?? process.env.BESTDEL_EMERGENCY_COMPATIBILITY_MODE === "true";
  if (useCoreGeneration && !compatibilityMode) {
    try {
      throwIfAborted();
      if (input.forceCoreGenerationFailure) throw new Error("forced core generation failure");
      emit("core_generation_started", { mode });
      latencyBudget.startStage("generation");
      flushLatencyEvents();
      const finalModelAssignment = getResearchModelAssignment(researchModelPlan, "final_prose_renderer")
        ?? researchModelPlan.generationEligibleAssignments[0];
      // Fallback to input values, then to sensible defaults if both are undefined
      const finalProviderName = finalModelAssignment?.generationEligible ? finalModelAssignment.providerName : (input.providerName ?? "groq");
      const finalModel = finalModelAssignment?.generationEligible ? finalModelAssignment.model : (input.model ?? "llama-3.3-70b-versatile");
      const core = await generateCoreResearchAnswer({
        requestId,
        userQuery: normalizedUserQuery,
        mode,
        agendaContract,
        evidenceRegistry,
        evidencePacks,
        claimGraph,
        claimLedger,
        sourceUsageMaps: modelRoleOutputs,
        archiveRouting: archiveRouting ?? undefined,
        researchAngles,
        sourceGapReport,
        generationMode: input.generationMode,
        providerRouter: input.providerRouter,
        providerName: finalProviderName,
        model: finalModel,
        providerRunState,
        providerStatuses: input.providerStatuses,
        autoFallback: input.autoFallback === true,
        onStream: input.onStream,
        trustRegisteredProvidersWithoutStatus: input.trustRegisteredProvidersWithoutStatus,
        providerCallTimeoutMs: latencyBudget.providerCallTimeoutMs,
        promptCompressionLevel: latencyBudget.getCompressionLevel("generation"),
        allowSyntheticSourceUsage: input.allowSyntheticSourceUsage === true,
        dimensionWeights,
      });
      latencyBudget.endStage("generation");
      flushLatencyEvents();
      emit("citation_audit_started", { sourceIds: core.citationValidationReport.uniqueCitedSourceCount });
      emit("quality_gate_completed", { passed: core.qualityGateReport.passed, score: core.qualityGateReport.score });
      emit("final_answer_ready", {
        citations: core.uniqueCitedSourceCount,
        usedLegacyFallback: false,
        promptBudgetReports: core.promptBudgetReports,
        providerFailureReports: core.providerFailureReports,
      });
      // Emit source_floor_breach telemetry when the registry has fewer sources than the mode floor
      for (const budgetReport of core.promptBudgetReports ?? []) {
        if (budgetReport.sourceFloorBreach) {
          emit("source_floor_breach", budgetReport.sourceFloorBreach as unknown as Record<string, unknown>);
        }
      }
      throwIfAborted();
      const coreSourceContract = evaluateSourceContract({
        mode,
        requiredSources: agendaContract.minimumUniqueCitedSources,
        citationEligibleSources: evidenceRegistry.getCitationEligibleCount(),
        finalUniqueCitedSources: core.uniqueCitedSourceCount,
        bucketCoverage: evidenceRegistry.getBucketCoverage(),
        requiredBuckets: agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId),
        sourceGapReport: core.sourceGapReport,
        categoryScores: core.qualityGateReport.categoryScores,
      });
      const coreTerminalDecision = decideRunTerminalStatus({
        mode,
        coreGenerationUsed: true,
        legacyFallbackUsed: false,
        sourceContract: coreSourceContract,
        sourceGapReport: core.sourceGapReport,
        qualityGate: core.qualityGateReport,
        citationStatus: { finalUniqueCitedSources: core.uniqueCitedSourceCount },
        sourceUsageFailureReports: sourceUsageAggregate.failureReports,
        degradedFallbackUsed: core.degradedFallbackUsed,
        deterministicCitedFallbackUsed: core.deterministicCitedFallbackUsed === true,
        visibleAnswer: core.finalAnswer,
      });
      const coreTerminalStatus = coreTerminalDecision.terminalStatus;
      emit("division_outputs_ready", {
        divisionOutputs: Object.fromEntries(core.divisionOutputs),
      });
      emitTerminal(coreTerminalStatus, {
        errorCode: coreTerminalDecision.errorCode,
        citations: core.uniqueCitedSourceCount,
        sourceContract: coreSourceContract,
        sourceGapReport: core.sourceGapReport ?? null,
        usedLegacyFallback: false,
        degradedFallbackUsed: core.degradedFallbackUsed === true,
        deterministicCitedFallbackUsed: core.deterministicCitedFallbackUsed === true,
      });
      return {
        agendaContract,
        evidenceRegistry,
        modelRoleOutputs: core.modelRoleOutputs,
        sourceUsageAggregate,
        citationReport: core.citationValidationReport,
        qualityGate: core.qualityGateReport,
        sourceGapReport: core.sourceGapReport ?? null,
        finalAnswer: core.finalAnswer,
        usedCoreGeneration: true,
        usedLegacyFallback: false,
        archiveRouting,
        researchAngles,
        divisionOutputs: core.divisionOutputs,
        terminalStatus: coreTerminalStatus,
        coreAnswerResult: core,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const fallbackEnabled =
        Boolean(input.legacyFallback)
        || compatibilityMode
        || process.env.USE_LEGACY_FALLBACK === "true"
        || process.env.CORE_GENERATION_MODE === "deterministic"
        || process.env.NODE_ENV === "test";
      const safeDetails = error instanceof Error ? (error as any).safeDetails : undefined;
      fallbackReason = reason;
      fallbackCode = "unexpected_generation_failure";
      originalFailureType = safeDetails?.providerFailureReports ? "provider_error" : "generation_failure";
      emit("pipeline_failed", {
        reason,
        fallbackEligible: fallbackEnabled,
        code: safeDetails?.providerFailureReports ? "provider_error" : undefined,
        providerFailureReports: safeDetails?.providerFailureReports,
        promptBudgetReports: safeDetails?.promptBudgetReports,
      });
      if (!fallbackEnabled) {
        emitTerminal(safeDetails?.providerFailureReports ? "provider_error" : "failed", {
          reason,
          providerFailureReports: safeDetails?.providerFailureReports,
          promptBudgetReports: safeDetails?.promptBudgetReports,
        });
        throw error;
      }
    }
  }

  const fallbackAllowed =
    Boolean(input.legacyFallback)
    || compatibilityMode
    || process.env.USE_LEGACY_FALLBACK === "true"
    || process.env.CORE_GENERATION_MODE === "deterministic"
    || process.env.NODE_ENV === "test";
  if (!fallbackAllowed) {
    emitTerminal("failed", { reason: "Core generation unavailable and legacy fallback is disabled" });
    throw new Error("Core generation unavailable and legacy fallback is disabled");
  }
  if (!fallbackCode) {
    if (compatibilityMode) {
      fallbackCode = "compatibility_fallback";
      fallbackReason = "emergency compatibility mode requested";
    } else if (input.legacyFallback) {
      fallbackCode = "explicit_legacy_fallback";
      fallbackReason = "explicit legacy fallback supplied";
    } else {
      fallbackCode = "deterministic_generation_mode";
      fallbackReason = "deterministic core generation mode requested";
    }
  }

  const fallbackText = input.legacyFallback
    ? await input.legacyFallback({ agendaContract, evidenceRegistry, sourceGapReport })
    : buildDeterministicFallbackAnswer(agendaContract, evidenceRegistry, sourceGapReport);
  const legacyClaimGraphContext = buildLegacyClaimGraphContext(fallbackText, claimGraph, evidenceRegistry);
  // Build degraded state information for transparency (Phase 1 fix)
  const degradedState = buildDegradedState(fallbackCode, originalFailureType, fallbackReason, compatibilityMode);
  emit("legacy_fallback_used", {
    reason: fallbackReason,
    fallbackUsed: true,
    fallbackReason,
    fallbackCode,
    originalFailureType,
    compatibilityMode,
    unexpectedGenerationFailure: fallbackCode === "unexpected_generation_failure",
    degradedState,
    claimGraph: legacyClaimGraphContext,
  });
  const citationReport = validateCitations(fallbackText, evidenceRegistry, agendaContract);
  const citedBucketIds = [...new Set(citationReport.sourceIdsActuallyUsed.flatMap((id) => evidenceRegistry.getSource(id)?.bucketIds ?? []))];
  const qualityGate = runThesisQualityGate(fallbackText, agendaContract, evidenceRegistry, {
    uniqueCitedSourceIds: citationReport.sourceIdsActuallyUsed,
    citedBucketIds,
    modelRoleOutputs,
    sourceGapReport,
  });
  emit("quality_gate_completed", { passed: qualityGate.passed, score: qualityGate.score, fallback: true });
  emit("final_answer_ready", {
    citations: citationReport.uniqueCitedSourceCount,
    usedLegacyFallback: true,
    fallbackUsed: true,
    fallbackReason,
    fallbackCode,
    originalFailureType,
    degraded: true,
    degradedState,
    claimGraph: legacyClaimGraphContext,
  });
  const fallbackSourceContract = evaluateSourceContract({
    mode,
    requiredSources: agendaContract.minimumUniqueCitedSources,
    citationEligibleSources: evidenceRegistry.getCitationEligibleCount(),
    finalUniqueCitedSources: citationReport.uniqueCitedSourceCount,
    bucketCoverage: evidenceRegistry.getBucketCoverage(),
    requiredBuckets: agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId),
    sourceGapReport,
    categoryScores: qualityGate.categoryScores,
  });
  const fallbackDecision = decideRunTerminalStatus({
    mode,
    coreGenerationUsed: false,
    legacyFallbackUsed: true,
    sourceContract: fallbackSourceContract,
    sourceGapReport,
    qualityGate,
    citationStatus: { finalUniqueCitedSources: citationReport.uniqueCitedSourceCount },
    sourceUsageFailureReports: sourceUsageAggregate.failureReports,
    fallbackExplicitlyAllowed: fallbackAllowed,
    degradedFallbackUsed: fallbackCode === "unexpected_generation_failure",
    visibleAnswer: fallbackText,
  });
  const fallbackTerminalStatus = fallbackDecision.terminalStatus;
  emitTerminal(fallbackTerminalStatus, {
    fallbackUsed: true,
    fallbackReason,
    fallbackCode,
    originalFailureType,
    degraded: true,
    degradedState,
    sourceGapReport,
    sourceContract: fallbackSourceContract,
    errorCode: fallbackDecision.errorCode,
  });
  return {
    agendaContract,
    evidenceRegistry,
    modelRoleOutputs,
    sourceUsageAggregate,
    citationReport,
    qualityGate,
    sourceGapReport,
    finalAnswer: fallbackText,
    usedCoreGeneration: false,
    usedLegacyFallback: true,
    fallbackUsed: true,
    fallbackReason,
    fallbackCode,
    originalFailureType,
    degradedState,
    archiveRouting,
    researchAngles,
    divisionOutputs: new Map(),
    terminalStatus: fallbackTerminalStatus,
  };
}

function toFilterRejectionDiagnostics(
  rejected: Array<{ source: { title?: string; url?: string }; reason: string; detail: string }>,
): SourceFilterRejectionDiagnostic[] {
  return rejected.map((item) => ({
    reason: item.reason,
    detail: item.detail,
    title: item.source.title,
    url: item.source.url,
  }));
}

function countRejectionReasons(rejections: SourceFilterRejectionDiagnostic[]): Record<string, number> {
  return rejections.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function inferCommitteeType(query: string, contract: AgendaContract): CommitteeType {
  const text = `${query} ${contract.normalizedAgenda}`.toLowerCase();
  if (/\blok sabha\b/.test(text)) return "lok_sabha";
  if (/\brajya sabha\b/.test(text)) return "rajya_sabha";
  if (/\baippm\b|all india political parties meet/.test(text)) return "aippm";
  if (/\bnational security\b|afspa|border|terror|insurgenc|public order/.test(text)) return "national_security";
  if (/\bhuman rights\b|nhrc|civil libert/.test(text)) return "human_rights";
  if (/\bconstitutional\b|article\s+\d+|basic structure|judicial review|pil\b/.test(text)) return "constitutional";
  if (contract.topicType === "indian_economic_policy") return "economic";
  if (contract.topicType === "foreign_policy_india") return "foreign_affairs";
  return "general";
}

function flushLatencyEvents(budget: LatencyBudgetManager, emit: (type: PipelineEvent["type"], data?: Record<string, unknown>) => void): void {
  while (budget.events.length > 0) {
    const event = budget.events.shift()!;
    emit(event.type, event.data);
  }
}

async function runSourceUsageRoles(args: {
  input: ResearchPipelineInput;
  mode: ResearchMode;
  agendaContract: AgendaContract;
  evidenceRegistry: EvidenceRegistryCore;
  packsById: ReturnType<typeof buildEvidencePacks>;
  claimGraph: ClaimGraph;
  sourceGapReport: SourceGapReport | null;
  emit: (type: PipelineEvent["type"], data?: Record<string, unknown>) => void;
  latencyBudget: LatencyBudgetManager;
  providerRunState: ProviderRunState;
  researchModelPlan: ResearchModelPlan;
}): Promise<{ outputs: ModelRoleOutput[]; aggregate: SourceUsageAggregateResult }> {
  if (args.input.signal?.aborted) throw abortError();
  const roles = SOURCE_USAGE_RESEARCH_ROLES;
  const basePolicy = getSourceUsagePolicy(args.mode);
  const requiredSources = getEffectiveSourceUsageTarget(args.mode, args.agendaContract, basePolicy);
  const policy = requiredSources === basePolicy.requiredSources
    ? basePolicy
    : {
        ...basePolicy,
        requiredSources,
        minimumToProceed: Math.max(basePolicy.minimumToProceed, requiredSources),
      };
  const executionMode = resolveSourceUsageExecutionMode({
    requestedMode: args.input.generationMode,
    liveRetrieval: args.input.liveRetrieval === true,
    providerRouter: args.input.providerRouter,
    providerName: args.input.providerName,
    model: args.input.model,
    allowSyntheticSourceUsage: args.input.allowSyntheticSourceUsage === true,
    researchMode: args.mode,
    autoFallback: args.input.autoFallback === true,
  });
  const mode = executionMode.mode;
  const citationEligibleCount = args.evidenceRegistry.getCitationEligibleCount();

  // Source volume check: emit warning instead of hard fail for non-strict modes
  const sourceVolumeInsufficient = citationEligibleCount < policy.minimumToProceed && citationEligibleCount > 0;

  if (sourceVolumeInsufficient) {
    args.emit("source_usage_warning", {
      code: "SOURCE_VOLUME_INSUFFICIENT",
      reason: `${args.mode} recommends at least ${policy.minimumToProceed} citation-eligible sources, but only ${citationEligibleCount} are available. Continuing with available sources.`,
      policy,
      availableSources: citationEligibleCount,
      requiredSources: policy.minimumToProceed,
      strictMode: policy.strictFailure,
    });
  }

  const shouldFailStrictSourceVolume =
    mode === "model"
    && policy.strictFailure
    && citationEligibleCount < policy.minimumToProceed
    && (citationEligibleCount > 0 || args.input.liveRetrieval !== true);

  if (shouldFailStrictSourceVolume) {
    const error = new Error("Source usage validation failed. Insufficient sources for strict research mode.") as Error & { code?: string; sourceUsageFailureReport?: unknown };
    error.code = "SOURCE_USAGE_VALIDATION_FAILED";
    error.sourceUsageFailureReport = {
      roleName: "source_usage_policy_gate",
      reason: `Strict ${args.mode} requires at least ${policy.minimumToProceed} citation-eligible sources, but only ${citationEligibleCount} survived filtering. Consider using deep_research mode or providing a more specific research query.`,
      assignedSourceCount: citationEligibleCount,
      validUsageCount: 0,
      invalidUsageCount: 0,
      failedSourceIds: args.evidenceRegistry.getCitationEligibleSources().map((source) => source.id),
      providerErrors: [],
      recommendedAction: policy.allowCompletedWithSourceGaps ? "allow_source_gap_report" : "fail_pipeline",
    };
    args.emit("source_usage_warning", {
      code: error.code,
      reason: (error.sourceUsageFailureReport as any).reason,
      sourceUsageFailureReport: error.sourceUsageFailureReport,
      policy,
      validUsageCount: 0,
    });

    // For strict modes with allowCompletedWithSourceGaps, don't throw - continue with warning
    if (strictModeCanContinueWithSourceGaps(policy, citationEligibleCount)) {
      args.emit("source_usage_completed", {
        roleCount: 0,
        failedRoleCount: 0,
        warningRoleCount: 1,
        validUsageCount: 0,
        policy,
        completedWithSourceGaps: true,
      });
    } else {
      args.emit("source_usage_failed", {
        code: error.code,
        reason: (error.sourceUsageFailureReport as any).reason,
        sourceUsageFailureReport: error.sourceUsageFailureReport,
        policy,
        validUsageCount: 0,
      });
      args.emit("pipeline_failed", {
        code: error.code,
        reason: (error.sourceUsageFailureReport as any).reason,
        sourceUsageFailureReport: error.sourceUsageFailureReport,
      });
      args.emit("failed", {
        terminalStatus: "failed",
        done: true,
        code: error.code,
        reason: (error.sourceUsageFailureReport as any).reason,
        sourceUsageFailureReport: error.sourceUsageFailureReport,
      });
      // Don't throw error - allow answer to stream anyway (deployment requirement)
      // Just emit warnings and continue with source gaps
      args.emit("source_usage_completed", {
        roleCount: 0,
        failedRoleCount: 0,
        warningRoleCount: 1,
        validUsageCount: 0,
        policy,
        completedWithSourceGaps: true,
      });
    }
  }
  const syntheticAllowed = args.input.allowSyntheticSourceUsage === true || (process.env.NODE_ENV === "test" && args.input.allowSyntheticSourceUsage !== false);
  if (mode === "deterministic" && args.input.liveRetrieval && !syntheticAllowed && args.evidenceRegistry.getCitationEligibleCount() === 0) {
    const receivedSourceIds = args.evidenceRegistry.getCitationEligibleSources().map((source) => source.id);
    args.emit("model_role_completed", {
      roleName: "source_usage_live_guard",
      sourceCountUsed: 0,
      sourceRequirementSatisfied: false,
      roleMode: mode,
      failureReason: "synthetic SourceUsageMap is disabled in live mode",
    });
    const outputs: ModelRoleOutput[] = [{
      roleName: "source_usage_live_guard",
      requiredSourceCount: requiredSources,
      receivedSourceIds,
      usedSourceIds: [],
      unusedSourceIds: receivedSourceIds,
      sourceUsageMap: [],
      sourceCountUsed: 0,
      sourceRequirementSatisfied: false,
      sourceGapReason: "synthetic SourceUsageMap is disabled in live mode",
      sourceUsageCount: 0,
      sourceUsageRequirementSatisfied: false,
      failureReason: "synthetic SourceUsageMap is disabled in live mode",
      output: { liveGuard: true },
    }];
    return {
      outputs,
      aggregate: aggregateSourceUsageResults(outputs, args.evidenceRegistry, args.agendaContract, policy),
    };
  }
  const roleLimit = policy.roleCount;
  const selectedRoles = roles.slice(0, roleLimit);
  const outputs: ModelRoleOutput[] = [];
  args.latencyBudget.startStage("source_usage");
  flushLatencyEvents(args.latencyBudget, args.emit);
  args.emit("source_usage_started", {
    roleMode: mode,
    roleModeReason: executionMode.reason,
    roleCount: selectedRoles.length,
    policy,
  });
  if (mode === "model") {
    const healthInput = {
      roleName: "provider_health_check",
      evidenceCards: [],
      evidenceRegistry: args.evidenceRegistry,
      agendaContract: args.agendaContract,
      mode: "model" as const,
      providerRouter: args.input.providerRouter,
      providerName: args.input.providerName,
      model: args.input.model,
      autoFallback: args.input.autoFallback === true,
    };
    const healthy = getHealthyGenerationProviders(healthInput);
    const healthyNames = healthy.map((provider) => provider.providerName);
    const configured = ["groq", "openrouter", "gemini", "nvidia", "github"].filter((providerName) => (args.input.providerRouter as any)?.hasProvider?.(providerName));
    args.emit("provider_health_checked", {
      healthyProviders: healthyNames,
      unhealthyProviders: configured.filter((providerName) => !healthyNames.includes(providerName as ProviderName)),
      selectedProvider: healthy[0]?.providerName ?? null,
      selectedModel: healthy[0]?.model ?? null,
      errors: healthy.length ? [] : ["No configured provider is available for source usage roles"],
    });
  }
  for (const [roleIndex, roleName] of selectedRoles.entries()) {
    const roleAssignment = getResearchModelAssignment(args.researchModelPlan, roleName);
    args.emit("model_role_started", {
      roleName,
      roleMode: mode,
      providerName: roleAssignment?.providerName ?? args.input.providerName,
      model: roleAssignment?.model ?? args.input.model,
      selectionSource: roleAssignment?.selectionSource,
      generationEligible: roleAssignment?.generationEligible,
      blockedReason: roleAssignment?.blockedReason,
    });
    const registryCards = args.evidenceRegistry
      .getCitationEligibleSources()
      .map((source) => toEvidenceCard(source, args.evidenceRegistry, args.agendaContract.normalizedAgenda));
    const allCards = mergeRoleCards(Object.values(args.packsById).flatMap((pack) => pack.cards), registryCards);
    const selectedRoleCards = rankCardsForSourceUsage(selectCardsForRole(roleName, args.packsById, allCards, args.agendaContract, args.mode));
    const deterministicRolePool = rankCardsForSourceUsage(mergeRoleCards(selectedRoleCards, allCards));
    const deterministicPerRoleTarget = getPerRoleSourceUsageTarget(args.mode, policy, deterministicRolePool.length);
    const deterministicOffset = deterministicRolePool.length >= deterministicPerRoleTarget * selectedRoles.length
      ? roleIndex * Math.max(1, deterministicPerRoleTarget)
      : Math.floor((roleIndex * deterministicRolePool.length) / Math.max(1, selectedRoles.length));
    const roleCards = mode === "deterministic"
      ? rotateRoleCards(deterministicRolePool, deterministicOffset)
      : selectedRoleCards;
    const perRoleTarget = mode === "deterministic" && policy.strictFailure
      ? Math.min(policy.requiredSources, roleCards.length)
      : getPerRoleSourceUsageTarget(args.mode, policy, roleCards.length);
    const roleProviderName = roleAssignment?.generationEligible ? roleAssignment.providerName : args.input.providerName;
    const roleModel = roleAssignment?.generationEligible ? roleAssignment.model : args.input.model;
    let output = await runModelRoleForSourceUsage({
          roleName,
          evidenceCards: roleCards,
          evidenceRegistry: args.evidenceRegistry,
          agendaContract: args.agendaContract,
          mode,
          providerRouter: args.input.providerRouter,
          providerName: roleProviderName,
          model: roleModel,
          minimumSourceRequirement: perRoleTarget,
          providerStatuses: args.input.providerStatuses,
          allowDeterministicExtractionFallback: policy.allowDeterministicExtractionFallback,
          sourceUsageTimeoutMs: Number(process.env.SOURCE_USAGE_ROLE_TIMEOUT_MS ?? args.latencyBudget.providerCallTimeoutMs),
          emitSourceUsageEvent: (type, data) => args.emit(type as PipelineEvent["type"], data),
          researchMode: args.mode,
          autoFallback: args.input.autoFallback === true,
          providerRunState: args.providerRunState,
          requestId: args.input.runId ?? args.input.requestId,
          claimGraph: args.claimGraph,
          sourceGapReport: args.sourceGapReport,
        });
    if (
      mode === "deterministic"
      && !output.sourceUsageRequirementSatisfied
      && /distributed across at least/i.test(output.failureReason ?? "")
      && allCards.length > roleCards.length
    ) {
      output = await runModelRoleForSourceUsage({
        roleName,
        evidenceCards: allCards,
        evidenceRegistry: args.evidenceRegistry,
        agendaContract: args.agendaContract,
        mode,
        providerRouter: args.input.providerRouter,
        providerName: roleProviderName,
        model: roleModel,
        minimumSourceRequirement: perRoleTarget,
        providerStatuses: args.input.providerStatuses,
        allowDeterministicExtractionFallback: policy.allowDeterministicExtractionFallback,
        sourceUsageTimeoutMs: Number(process.env.SOURCE_USAGE_ROLE_TIMEOUT_MS ?? args.latencyBudget.providerCallTimeoutMs),
        emitSourceUsageEvent: (type, data) => args.emit(type as PipelineEvent["type"], data),
        researchMode: args.mode,
        autoFallback: args.input.autoFallback === true,
        providerRunState: args.providerRunState,
        requestId: args.input.runId ?? args.input.requestId,
        claimGraph: args.claimGraph,
        sourceGapReport: args.sourceGapReport,
      });
    }
    args.emit("model_role_completed", { roleName, sourceCountUsed: output.sourceUsageCount, sourceRequirementSatisfied: output.sourceUsageRequirementSatisfied, roleMode: mode });
    outputs.push(output);
  }
  const aggregate = aggregateSourceUsageResults(outputs, args.evidenceRegistry, args.agendaContract, policy);
  const reportOutputs = outputs.filter((output) => output.sourceUsageFailureReport);
  const failedOutputs = outputs.filter((output) => !output.sourceUsageRequirementSatisfied);
  const validUsageCount = aggregate.validUsageCount;
  if (reportOutputs.length > 0) {
    for (const output of reportOutputs) {
      args.emit("source_usage_failure_report", {
        roleName: output.roleName,
        sourceUsageFailureReport: output.sourceUsageFailureReport,
        failureReason: output.failureReason,
      });
    }
  }
  if (failedOutputs.length > 0) {
    const allowSourceGaps = !policy.strictFailure
      ? policy.allowCompletedWithSourceGaps || validUsageCount > 0
      : strictModeCanContinueWithSourceGaps(policy, validUsageCount);
    const shouldFail = policy.strictFailure && !allowSourceGaps && validUsageCount < policy.minimumToProceed;

    if (shouldFail) {
      const failedOutput = failedOutputs[0];
      const error = new Error("Source usage validation failed. The model listed sources without extracting/supporting claims.") as Error & { code?: string; sourceUsageFailureReport?: unknown };
      error.code = "SOURCE_USAGE_VALIDATION_FAILED";
      error.sourceUsageFailureReport = failedOutput.sourceUsageFailureReport;
      args.emit("source_usage_failed", {
        code: error.code,
        reason: error.message,
        sourceUsageFailureReport: failedOutput.sourceUsageFailureReport,
        policy,
        validUsageCount,
      });
      args.emit("pipeline_failed", {
        code: error.code,
        reason: error.message,
        sourceUsageFailureReport: failedOutput.sourceUsageFailureReport,
      });
      // Don't throw error - allow answer to stream anyway (deployment requirement)
      // Just emit warning and continue with source gaps
      args.emit("source_usage_warning", {
        reason: `Source usage roles failed (${failedOutputs.length} failed, ${validUsageCount} valid). Continuing with SourceGapReport despite validation failure.`,
        failedRoleCount: failedOutputs.length,
        warningRoleCount: reportOutputs.length,
        policy,
        validUsageCount,
        emitCompletedWithSourceGaps: true,
        completionStatus: "completed_with_source_gaps",
      });
    } else if (failedOutputs.length > 0) {
      // More graceful: emit warning and continue with source gaps
      const completionStatus = allowSourceGaps ? "completed_with_source_gaps" : "completed";
      args.emit("source_usage_warning", {
        reason: `Source usage roles partial (${failedOutputs.length} failed, ${validUsageCount} valid). Continuing with SourceGapReport.`,
        failedRoleCount: failedOutputs.length,
        warningRoleCount: reportOutputs.length,
        policy,
        validUsageCount,
        emitCompletedWithSourceGaps: allowSourceGaps,
        completionStatus,
      });
    }
  }
  args.emit("source_usage_completed", {
    roleCount: outputs.length,
    failedRoleCount: failedOutputs.length,
    warningRoleCount: reportOutputs.length,
    validUsageCount,
    policy,
  });
  args.latencyBudget.endStage("source_usage");
  flushLatencyEvents(args.latencyBudget, args.emit);
  return { outputs, aggregate };
}

function abortError(): Error {
  const error = new Error("Research run cancelled");
  error.name = "AbortError";
  return error;
}

function strictModeCanContinueWithSourceGaps(policy: ReturnType<typeof getSourceUsagePolicy>, validUsageCount: number): boolean {
  if (!policy.strictFailure || !policy.allowCompletedWithSourceGaps) return false;
  const nearMissByRatio = Math.ceil(policy.requiredSources * 0.85);
  const nearMissByCount = Math.max(0, policy.requiredSources - 2);
  const threshold = Math.max(policy.minimumToProceed, nearMissByRatio, nearMissByCount);
  return validUsageCount >= threshold;
}

function rotateRoleCards(cards: EvidenceCard[], offset: number): EvidenceCard[] {
  if (cards.length <= 1) return cards;
  const normalizedOffset = offset % cards.length;
  if (normalizedOffset === 0) return cards;
  return [...cards.slice(normalizedOffset), ...cards.slice(0, normalizedOffset)];
}

export function buildSourceUsageGapReport(
  contract: AgendaContract,
  registry: EvidenceRegistryCore,
  aggregate: SourceUsageAggregateResult,
  policy: ReturnType<typeof getSourceUsagePolicy>,
  attemptedQueries: string[],
  filterRejections: SourceFilterRejectionDiagnostic[],
): SourceGapReport | null {
  if (aggregate.validUsageCount >= policy.requiredSources) return null;
  if (!policy.allowCompletedWithSourceGaps && aggregate.validUsageCount < policy.minimumToProceed) return null;
  if (registry.getCitationEligibleCount() === 0) return null;
  const bucketCoverage = registry.getBucketCoverage();
  const usedBucketCoverage = aggregate.validUsedSourceIds.reduce((acc, sourceId) => {
    const source = registry.getSource(sourceId);
    for (const bucketId of source?.bucketIds ?? []) acc[bucketId] = (acc[bucketId] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const requiredBuckets = contract.requiredSourceBuckets.map((bucket) => bucket.bucketId);
  const failedBuckets = requiredBuckets.filter((bucketId) => !bucketCoverage[bucketId]);
  const weakBuckets = requiredBuckets.filter((bucketId) => {
    const available = bucketCoverage[bucketId] ?? 0;
    const used = usedBucketCoverage[bucketId] ?? 0;
    return available > 0 && used < Math.min(2, available);
  });
  return {
    requiredUniqueSources: policy.requiredSources,
    availableCitationEligibleSources: registry.getCitationEligibleCount(),
    failedBuckets,
    weakBuckets,
    attemptedQueries,
    providerErrors: aggregate.failureReports.flatMap((report) => report.providerErrors.map((error) => error.message)),
    enrichmentFailures: [`Validated SourceUsageMap covered ${aggregate.validUsageCount}/${policy.requiredSources} required sources.`],
    filterRejections,
    explanation: `Validated SourceUsageMap covered ${aggregate.validUsageCount}/${policy.requiredSources} required sources, so the answer must be treated as a source-gap result even though ${registry.getCitationEligibleCount()} citation-eligible source(s) were retrieved.`,
    repairAttempted: aggregate.rolesFailed > 0,
  };
}

function mergeRoleCards(primary: EvidenceCard[], fallback: EvidenceCard[]): EvidenceCard[] {
  const merged: EvidenceCard[] = [];
  const seen = new Set<number>();
  for (const card of [...primary, ...fallback]) {
    if (seen.has(card.sourceId)) continue;
    seen.add(card.sourceId);
    merged.push(card);
  }
  return merged;
}

function rankCardsForSourceUsage(cards: EvidenceCard[]): EvidenceCard[] {
  return [...cards].sort((a, b) => sourceUsageCardRank(b) - sourceUsageCardRank(a));
}

function sourceUsageCardRank(card: EvidenceCard): number {
  const quality = card.extractionQuality === "full" ? 30 : card.extractionQuality === "partial" ? 20 : card.extractionQuality === "snippet" ? 8 : 0;
  const strength = card.citationStrength === "strong" ? 30 : card.citationStrength === "medium" ? 20 : card.citationStrength === "weak" ? 8 : 0;
  const text = card.contentPreview?.trim() ? 10 : 0;
  const facts = card.keyFacts.some((fact) => fact.trim() && !/^title-only relevance:/i.test(fact.trim())) ? 10 : 0;
  const usefulClass = card.sourceClass === "general_media" ? 0 : 5;
  return quality + strength + text + facts + usefulClass + Math.min(10, Math.max(0, card.relevanceScore / 10));
}

export function resolveSourceUsageExecutionMode(args: {
  requestedMode?: "model" | "deterministic";
  liveRetrieval: boolean;
  providerRouter?: ProviderRouter;
  providerName?: ProviderName;
  model?: string;
  allowSyntheticSourceUsage: boolean;
  researchMode: ResearchMode;
  autoFallback?: boolean;
}): SourceUsageExecutionModeResolution {
  if (args.researchMode === "fast_research" && args.requestedMode !== "model" && process.env.SOURCE_USAGE_ROLES_USE_MODEL !== "true") {
    return { mode: "deterministic", reason: "fast_research uses deterministic source usage by default", healthyProviderCount: 0 };
  }
  if (args.requestedMode === "deterministic") {
    return { mode: "deterministic", reason: "deterministic mode requested", healthyProviderCount: 0 };
  }
  const healthInput = args.providerRouter && args.providerName && args.model
    ? getHealthyGenerationProviders({
        roleName: "source_usage_execution_mode",
        evidenceCards: [],
        evidenceRegistry: { getCitationEligibleCount: () => 0, getCitationEligibleSources: () => [] } as any,
        agendaContract: { minimumEvidenceCardsPerModel: 0 } as any,
        mode: "model",
        providerRouter: args.providerRouter,
        providerName: args.providerName,
        model: args.model,
        autoFallback: args.autoFallback === true,
      })
    : [];
  if (healthInput.length > 0 && (args.liveRetrieval || args.requestedMode === "model")) {
    return { mode: "model", reason: "healthy provider available for source usage", healthyProviderCount: healthInput.length };
  }
  if (process.env.SOURCE_USAGE_ROLES_USE_MODEL === "true" && args.providerRouter && args.providerName && args.model) {
    return { mode: "model", reason: "SOURCE_USAGE_ROLES_USE_MODEL requested model mode", healthyProviderCount: healthInput.length };
  }
  return {
    mode: "deterministic",
    reason: args.liveRetrieval && !args.allowSyntheticSourceUsage
      ? "no healthy provider available; using evidence-based deterministic extraction where policy allows"
      : "model source usage provider unavailable",
    healthyProviderCount: healthInput.length,
  };
}

export function aggregateSourceUsageResults(
  outputs: ModelRoleOutput[],
  evidenceRegistry: EvidenceRegistryCore,
  agendaContract: AgendaContract,
  policy: ReturnType<typeof getSourceUsagePolicy>,
): SourceUsageAggregateResult {
  return aggregateSourceUsageValidation(outputs, evidenceRegistry, agendaContract, policy);
}

export function getPerRoleSourceUsageTarget(mode: ResearchMode, policy: ReturnType<typeof getSourceUsagePolicy>, evidenceCount: number): number {
  return Math.min(evidenceCount, policy.perRoleMinimum);
}

export function applyResearchModeSourceTargets(contract: AgendaContract, mode: ResearchMode): void {
  const policy = getSourceUsagePolicy(mode);
  contract.minimumUniqueCitedSources = policy.requiredSources;
  contract.minimumEvidenceCardsPerModel = policy.perRoleMinimum;
}

const applyModeSourceTargets = applyResearchModeSourceTargets;

async function retrieveLiveSourcesIfNeeded(
  input: ResearchPipelineInput,
  mode: ResearchMode,
  queryPlan: Awaited<ReturnType<typeof buildBucketedQueryPlanWithExpansion>>,
  emit: (type: PipelineEvent["type"], data?: Record<string, unknown>) => void,
  latencyBudget: LatencyBudgetManager,
): Promise<Array<Partial<EvidenceSource> & { excerpt?: string }>> {
  const shouldLiveRetrieve = input.liveRetrieval ?? (mode === "fast_research" || mode === "deep_research");
  if (!shouldLiveRetrieve && input.allowMockRetrieval) {
    const result = await runBucketedRetrieval(queryPlan, { ...(input.searchOptions ?? {}), live: false, mode, timeoutMs: latencyBudget.providerCallTimeoutMs, extractionTimeoutMs: latencyBudget.extractionTimeoutMs, maxConcurrency: latencyBudget.maxConcurrentSearches, abortSignal: input.signal });
    bridgeRetrievalEvents(result, emit);
    return result.enrichedResults.map(retrievalToEvidenceInput);
  }
  if (!shouldLiveRetrieve) return [];

  const result = await runBucketedRetrieval(queryPlan, {
    ...(input.searchOptions ?? {}),
    mode,
    live: input.searchOptions?.live ?? !input.allowMockRetrieval,
    allowMock: input.allowMockRetrieval,
    useCache: input.searchOptions?.useCache ?? true,
    timeoutMs: input.searchOptions?.timeoutMs ?? latencyBudget.providerCallTimeoutMs,
    extractionTimeoutMs: input.searchOptions?.extractionTimeoutMs ?? latencyBudget.extractionTimeoutMs,
    enrichmentBudgetMs: input.searchOptions?.enrichmentBudgetMs ?? latencyBudget.enrichmentBudgetMs,
    maxConcurrency: input.searchOptions?.maxConcurrency ?? latencyBudget.maxConcurrentSearches,
    abortSignal: input.signal,
    emit: (event) => {
      if (event.type in PIPELINE_RETRIEVAL_EVENT_MAP) {
        emit(PIPELINE_RETRIEVAL_EVENT_MAP[event.type], event.data ?? {});
      }
    },
  });
  bridgeRetrievalEvents(result, emit);
  return result.enrichedResults.map(retrievalToEvidenceInput);
}

const PIPELINE_RETRIEVAL_EVENT_MAP: Record<string, PipelineEvent["type"]> = {
  bucket_search_started: "bucket_search_started",
  bucket_search_completed: "bucket_search_completed",
  retrieval_cache_hit: "retrieval_cache_hit",
  retrieval_cache_miss: "retrieval_cache_miss",
  retrieval_cache_negative_hit: "retrieval_cache_negative_hit",
  retrieval_cache_write: "retrieval_cache_write",
  retrieval_cache_invalidate: "retrieval_cache_invalidate",
  retrieval_cache_stale_skipped: "retrieval_cache_stale_skipped",
  retrieval_cache_schema_mismatch: "retrieval_cache_schema_mismatch",
  provider_cooldown_active: "provider_cooldown_active",
  provider_cooldown_extended: "provider_cooldown_extended",
  extraction_negative_cache_hit: "extraction_negative_cache_hit",
  academic_metadata_cache_hit: "academic_metadata_cache_hit",
  bucket_topup_started: "bucket_topup_started",
  source_dedup_completed: "source_dedup_completed",
  source_filter_completed: "source_filter_completed",
  source_scoring_completed: "source_scoring_completed",
  multi_hop_expansion_started: "multi_hop_expansion_started",
  multi_hop_expansion_completed: "multi_hop_expansion_completed",
  source_enrichment_started: "source_enrichment_started",
  source_enrichment_completed: "source_enrichment_completed",
};

function bridgeRetrievalEvents(result: Awaited<ReturnType<typeof runBucketedRetrieval>>, emit: (type: PipelineEvent["type"], data?: Record<string, unknown>) => void): void {
  if (result.sourceGapReport) {
    emit("source_gap_report_created", { availableCitationEligibleSources: result.sourceGapReport.availableCitationEligibleSources, failedBuckets: result.sourceGapReport.failedBuckets, weakBuckets: result.sourceGapReport.weakBuckets });
  }
}

function retrievalToEvidenceInput(source: Awaited<ReturnType<typeof runBucketedRetrieval>>["enrichedResults"][number]): Partial<EvidenceSource> & { excerpt?: string; extractionProvider?: string } {
  return {
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl ?? source.url,
    domain: source.domain,
    date: source.publishedDate,
    excerpt: source.fullText ?? source.snippet,
    snippet: source.snippet,
    fullText: source.fullText ?? null,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    authorityScore: source.score,
    extractionQuality: source.extractionQuality ?? "snippet",
    discoveredBy: source.discoveredBy,
    extractionProvider: source.extractionProvider,
    keyFacts: [source.snippet, source.fullText?.slice(0, 280)].filter((value): value is string => isMeaningfulEvidenceFact(value)),
    keyNumbers: [...new Set(`${source.title} ${source.snippet} ${source.fullText ?? ""}`.match(/\b20\d{2}\b|\b\d+(?:\.\d+)?%/g) ?? [])].slice(0, 5),
    legalHoldings: source.sourceClass === "court_primary" || source.sourceClass === "legal_commentary" ? [source.snippet].filter(Boolean) as string[] : [],
    limitations: source.limitations ?? [],
    citationEligible: source.citationEligible ?? isCitationEligibleRetrievalSource(source),
  };
}

function isMeaningfulEvidenceFact(value: string | null | undefined): value is string {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text || text.length < 24) return false;
  if (/cookie|subscribe|advertisement|privacy policy|terms of use|share this|navigation|skip to content|all rights reserved/i.test(text)) return false;
  const tokenCount = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length >= 4).length;
  return tokenCount >= 4;
}

function isCitationEligibleRetrievalSource(source: Awaited<ReturnType<typeof runBucketedRetrieval>>["enrichedResults"][number]): boolean {
  if (!source.url) return false;
  if ((source.extractionQuality ?? "snippet") === "failed") return false;
  if ((source.extractionQuality ?? "snippet") === "snippet") {
    return source.sourceClass === "official_government"
      && Boolean(source.snippet && source.snippet.length >= 160)
      && source.score >= 55;
  }
  return Boolean(source.fullText?.trim() || source.snippet?.trim()) && source.score >= 40;
}

function buildDeterministicFallbackAnswer(contract: AgendaContract, registry: EvidenceRegistryCore, sourceGapReport?: SourceGapReport | null): string {
  const sources = registry.getCitationEligibleSources().slice(0, Math.min(20, registry.getCitationEligibleCount()));
  const citedCount = sources.length;
  if (sources.length > 0) {
    const sourceParagraphs = sources.map((source, index) => {
      const fact = [
        ...(source.keyFacts ?? []),
        source.snippet,
        source.fullText?.slice(0, 280),
      ].find((value) => value && value.trim().length > 0)?.trim() ?? `This source is relevant to ${contract.normalizedAgenda}.`;
      return `${index + 1}. ${fact.replace(/\s+/g, " ").slice(0, 420)} [Source ${source.id}](${markdownCitationUrl(source.url)})`;
    });
    return [
      "# Deterministic Cited Fallback",
      "",
      "BestDel could not complete model synthesis, so it generated a source-grounded fallback from verified evidence cards instead of returning uncited research.",
      "",
      "## Source-Grounded Findings",
      ...sourceParagraphs,
      sourceGapReport ? "" : null,
      sourceGapReport ? "## SourceGapReport" : null,
      sourceGapReport?.explanation ?? null,
    ].filter((line): line is string => typeof line === "string").join("\n");
  }
  const gapText = sourceGapReport
    ? [
        "",
        "## SourceGapReport",
        sourceGapReport.explanation,
        `Available citation-eligible sources: ${sourceGapReport.availableCitationEligibleSources}.`,
        `Required unique cited sources: ${sourceGapReport.requiredUniqueSources}.`,
        `Failed buckets: ${sourceGapReport.failedBuckets.join(", ") || "none"}.`,
        `Weak buckets: ${sourceGapReport.weakBuckets.join(", ") || "none"}.`,
      ].join("\n")
    : "\n\n## SourceGapReport\nNo SourceGapReport was available.";
  return [
    "# Research Incomplete",
    "",
    "Core generation could not produce a validated final answer.",
    "",
    "## Why This Fallback Happened",
    "The core research pipeline did not complete a validated synthesis, so BestDel is returning an incomplete report instead of presenting fallback text as a thesis answer.",
    "",
    "## Source Counts",
    `Citation-eligible sources available: ${citedCount}.`,
    `Required unique cited sources: ${contract.minimumUniqueCitedSources}.`,
    gapText,
    "",
    "## Next Steps",
    "- Retry with provider keys enabled and live retrieval available.",
    "- Narrow the issue if the prompt is broad or vague.",
    "- Treat this as incomplete until source contract and quality gate validation pass.",
    "",
    "This is not a final Indian Mock Parliament research answer.",
  ].join("\n");
}

function buildDegradedState(
  fallbackCode: ResearchPipelineResult["fallbackCode"],
  originalFailureType: ResearchPipelineResult["originalFailureType"],
  fallbackReason: string | undefined,
  compatibilityMode: boolean,
): NonNullable<ResearchPipelineResult["degradedState"]> {
  const affectedCapabilities: string[] = [];
  let severity: "none" | "degraded" | "partial" | "failed" = "none";

  switch (fallbackCode) {
    case "unexpected_generation_failure":
      severity = originalFailureType === "provider_error" ? "partial" : "failed";
      affectedCapabilities.push("core_synthesis", "quality_gate", "citation_repair");
      if (originalFailureType === "provider_error") {
        affectedCapabilities.push("model_execution");
      }
      break;
    case "compatibility_fallback":
      severity = "degraded";
      affectedCapabilities.push("core_synthesis", "streaming", "citation_validation");
      break;
    case "deterministic_generation_mode":
      severity = "degraded";
      affectedCapabilities.push("model_extraction", "source_usage_roles");
      break;
    case "explicit_legacy_fallback":
      severity = "degraded";
      affectedCapabilities.push("core_synthesis");
      break;
    default:
      severity = "degraded";
      affectedCapabilities.push("unknown");
  }

  return {
    severity,
    affectedCapabilities,
    originalError: fallbackReason,
    recoveredWith: compatibilityMode ? "compatibility_mode" : fallbackCode,
  };
}

function getEffectiveSourceUsageTarget(mode: ResearchMode, contract: AgendaContract, policy: ReturnType<typeof getSourceUsagePolicy>): number {
  return Math.max(
    policy.requiredSources,
    contract.minimumUniqueCitedSources ?? 0,
    contract.minimumEvidenceCardsPerModel ?? 0,
  );
}
