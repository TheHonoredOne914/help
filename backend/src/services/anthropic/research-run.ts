import { getArchiveResearchAngles } from "../../db.js";
import { isOpenCodeZenEnabled } from "../../lib/opencode-zen-client.js";
import { OPENCODE_ZEN_STRONG_MODEL } from "../../core/providers/opencode-zen-provider.js";
import { runResearchPipeline, type ResearchPipelineResult } from "../../core/pipeline/research-pipeline.js";
import type { PipelineEvent } from "../../core/pipeline/pipeline-events.js";
import { stripPipelineMetadata } from "../../core/pipeline/pipeline-metadata.js";
import { evaluateSourceContract } from "../../core/evidence/source-contract.js";
import { buildResultSnapshot, decideRunTerminalStatus, persistRunSnapshot, selectCanonicalRunTerminalStatus } from "../../core/run-state/index.js";
import { getSourceUsagePolicy } from "../../core/config/source-usage-policy.js";
import { buildArchiveContextText } from "./archive-context-adapter.js";
import { buildCoreProviderRouter } from "./core-provider-router.js";
import { DEFAULT_GROQ_MODEL, type MessageRouteContext } from "./message-preflight.js";
import { assistantPersistenceStore } from "./persistence-store.js";
import { embedPipelineMeta, modeAwareFailureTitle, buildLegacyTerminalMetadata, type PipelineMetadata } from "./pipeline-types.js";
import { maybeMergeArchive, persistAssistantFailed } from "../assistant-persistence.js";
import type { RequestKeys } from "../../lib/types.js";

export interface ResearchRunInput {
  context: MessageRouteContext;
  keys: RequestKeys;
  signal: AbortSignal;
  isDisconnected: () => boolean;
  sendRunEvent: (eventType: string, payload?: Record<string, unknown>) => void;
  finishStream: () => void;
  logInfo?: (obj: Record<string, unknown>, msg?: string) => void;
  mergeArchive: (finalAnswer: string) => Promise<void>;
}

export async function executeResearchRun(input: ResearchRunInput): Promise<void> {
  const {
    conversationId,
    userContent,
    effectiveResearchMode,
    autoFallback,
    rawNormalModel,
    effectiveWebModels,
    archiveTopic,
    archiveSummary,
    archiveId,
    assistantMessage,
    runIdentity,
  } = input.context;
  const { requestId, runId } = runIdentity;
  const keys = input.keys;
  const requestAbortController = { signal: input.signal };
  const sendRunEvent = input.sendRunEvent;
  const writer = { finishStream: input.finishStream };

      // Generation uses the user-selected provider. OpenCode Zen is registered as a
      // fallback (STAGE_FALLBACK_ORDER) and is used as primary only when the selected
      // provider cannot be resolved.
      const userSelectedCoreModel = (effectiveWebModels[0] ?? rawNormalModel) || DEFAULT_GROQ_MODEL;
      const coreProvider = buildCoreProviderRouter(keys, userSelectedCoreModel);
      if (coreProvider.error) {
        const opencodeAvailable = isOpenCodeZenEnabled(keys.opencodeKey ?? null);
        if (opencodeAvailable) {
          const fallbackProvider = buildCoreProviderRouter(keys, `opencode/${OPENCODE_ZEN_STRONG_MODEL}`);
          if (!fallbackProvider.error) {
            Object.assign(coreProvider, fallbackProvider);
            delete coreProvider.error;
          }
        }
        if (coreProvider.error) {
          sendRunEvent("provider_error", {
            providerError: coreProvider.error,
            providerConfigurationError: true,
            coreGenerationMode: "model_required",
            done: true,
          });
          await persistAssistantFailed({
            store: assistantPersistenceStore,
            conversationId,
            assistantMessageId: assistantMessage?.id,
            title: "Provider Error",
            message: `Provider configuration error: ${coreProvider.error}`,
            metadata: buildLegacyTerminalMetadata(runIdentity, "provider_error", {
              researchMode: effectiveResearchMode,
              liveRetrievalUsed: true,
              error: { code: "provider_configuration_error", message: coreProvider.error, recoverable: true },
            } as PipelineMetadata),
          });
          writer.finishStream();
          return;
        }
      }
      input.logInfo?.({
        event: "research_model_resolved",
        runId,
        conversationId,
        userSelectedCoreModel,
        resolvedProviderName: coreProvider.providerName,
        resolvedModel: coreProvider.model,
        autoFallback,
      }, "research model resolved");
      // Track how many tokens were streamed incrementally so we can avoid sending
      // the full answer again as a batch (which would duplicate content on the frontend).
      let streamedTokenCount = 0;
      let streamedText = "";
      const savedArchiveAngles = await loadSavedArchiveAngles(archiveId);
      let pipelineResult: ResearchPipelineResult;
      try {
      pipelineResult = await runResearchPipeline({
        runId,
        requestId,
        conversationId,
        assistantMessageId: assistantMessage?.id,
        userQuery: userContent,
        mode: effectiveResearchMode,
        archiveText: buildArchiveContextText(archiveTopic, archiveSummary),
        archiveAngleGraph: savedArchiveAngles.length
          ? { topic: archiveTopic, validatedAngles: savedArchiveAngles }
          : null,
        liveRetrieval: true,
        allowMockRetrieval: false,
        allowSyntheticSourceUsage: false,
        onStream: (chunk: string) => {
          streamedTokenCount++;
          streamedText += chunk;
          sendRunEvent('answer_delta', { content: chunk });
        },
        searchOptions: {
          live: true,
          allowMock: false,
          mode: effectiveResearchMode,
          providerKeys: {
            tavily: keys.tavilyKey ?? undefined,
            brave: keys.braveKey ?? undefined,
            serper: keys.serperKey ?? undefined,
            exa: keys.exaKey ?? undefined,
            firecrawl: keys.firecrawlKey ?? undefined,
            jina: keys.jinaKey ?? undefined,
            scraperapi: keys.scraperapiKey ?? undefined,
            zenrows: keys.zenrowsKey ?? undefined,
            scrapingbee: keys.scrapingbeeKey ?? undefined,
            geekflare: keys.geekflareKey ?? undefined,
          },
          useCache: true,
        },
        ...(effectiveResearchMode === "fast_research" ? {} : { generationMode: "model" as const }),
        providerRouter: coreProvider.router,
        providerName: coreProvider.providerName,
        model: coreProvider.model,
        userSelectedModels: effectiveWebModels,
        autoFallback,
        signal: requestAbortController.signal,
        trustRegisteredProvidersWithoutStatus: true,
        emit: (event: PipelineEvent) => {
          input.logInfo?.({
            runId,
            conversationId,
            corePipelineEvent: event.type,
            corePipelineData: event.data ?? {},
          }, "core research pipeline event");
          sendRunEvent("core_pipeline_event", {
            type: "core_pipeline_event",
            corePipelineEvent: event.type,
            corePipelineData: event.data ?? {},
          });
        },
      });
      } catch (error) {
        const partial = streamedText.trim();
        if (partial && error && typeof error === "object") {
          (error as { partialText?: string }).partialText = partial;
        }
        throw error;
      }
      const sourceUsagePolicy = getSourceUsagePolicy(effectiveResearchMode);
      const sourceUsageWarningRoles = pipelineResult.modelRoleOutputs.filter((role) => role.sourceUsageFailureReport);
      const sourceUsageFailedRoles = pipelineResult.modelRoleOutputs.filter((role) => !role.sourceUsageRequirementSatisfied);
      const sourceUsageFailureReports = [
        ...sourceUsageFailedRoles.map((role) => role.sourceUsageFailureReport).filter(Boolean),
        ...sourceUsageWarningRoles.map((role) => role.sourceUsageFailureReport).filter(Boolean),
      ];
      const providerErrors = sourceUsageFailureReports.flatMap((report) => report?.providerErrors ?? []);
      const citationStatus = {
        finalUniqueCitedSources: pipelineResult.citationReport.uniqueCitedSourceCount,
        totalLinkedCitations: pipelineResult.citationReport.linkedCitationCount,
        citedSourceIds: pipelineResult.citationReport.sourceIdsActuallyUsed,
        citationCoverage: pipelineResult.evidenceRegistry.getCitationEligibleCount() > 0
          ? pipelineResult.citationReport.uniqueCitedSourceCount / pipelineResult.evidenceRegistry.getCitationEligibleCount()
          : 0,
        invalidCitations: pipelineResult.citationReport.invalidCitations,
        citedBuckets: pipelineResult.citationReport.citedBuckets,
      };
      const strictSourceContract = evaluateSourceContract({
        mode: effectiveResearchMode,
        requiredSources: pipelineResult.agendaContract.minimumUniqueCitedSources,
        citationEligibleSources: pipelineResult.evidenceRegistry.getCitationEligibleCount(),
        finalUniqueCitedSources: pipelineResult.citationReport.uniqueCitedSourceCount,
        bucketCoverage: pipelineResult.evidenceRegistry.getBucketCoverage(),
        requiredBuckets: pipelineResult.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId),
        sourceGapReport: pipelineResult.sourceGapReport,
        categoryScores: pipelineResult.qualityGate.categoryScores,
      });
      const sourceContract = {
        ...strictSourceContract,
        requiredEvidenceCardsPerModel: pipelineResult.agendaContract.minimumEvidenceCardsPerModel,
        requiredUniqueCitedSources: pipelineResult.agendaContract.minimumUniqueCitedSources,
        citationEligibleSources: pipelineResult.evidenceRegistry.getCitationEligibleCount(),
        finalUniqueCitedSources: pipelineResult.citationReport.uniqueCitedSourceCount,
        passed: strictSourceContract.passed && (!sourceUsagePolicy.strictFailure || sourceUsageFailedRoles.length === 0),
        completedWithSourceGaps: strictSourceContract.status === "passed_with_source_gaps" || (!sourceUsagePolicy.strictFailure && (sourceUsageFailedRoles.length > 0 || sourceUsageWarningRoles.length > 0)),
        roles: pipelineResult.modelRoleOutputs.map((role) => ({
          roleName: role.roleName,
          sourceCountUsed: role.sourceUsageCount,
          passed: role.sourceUsageRequirementSatisfied,
          sourceGapReason: role.failureReason,
        })),
      };
      sendRunEvent("citation_status", { citationStatus });
      sendRunEvent("source_contract", { sourceContract });
      sendRunEvent("quality_gate", { coreQualityGate: pipelineResult.qualityGate });
      const terminalDecision = decideRunTerminalStatus({
        mode: effectiveResearchMode,
        coreGenerationUsed: pipelineResult.usedCoreGeneration,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        sourceContract: strictSourceContract,
        sourceGapReport: pipelineResult.sourceGapReport,
        qualityGate: pipelineResult.qualityGate,
        citationStatus,
        sourceUsageFailureReports,
        fallbackExplicitlyAllowed: false,
        degradedFallbackUsed: pipelineResult.coreAnswerResult?.degradedFallbackUsed === true,
        visibleAnswer: pipelineResult.finalAnswer,
      });
      const terminalStatus = selectCanonicalRunTerminalStatus(terminalDecision, pipelineResult.terminalStatus);
      const snapshot = buildResultSnapshot({
        runIdentity,
        finalAnswer: terminalDecision.visibleAnswer || stripPipelineMetadata(pipelineResult.finalAnswer).trim(),
        terminalStatus,
        errorCode: terminalDecision.errorCode,
        error: terminalDecision.errorCode
          ? { code: terminalDecision.errorCode, message: "Final answer was empty after hidden metadata was stripped.", stage: "final_output", retryable: true }
          : undefined,
        sources: pipelineResult.evidenceRegistry.sources.map((source) => ({
          sourceId: source.id,
          title: source.title,
          url: source.url,
          sourceType: source.sourceClass,
          bucketIds: source.bucketIds,
          discoveredBy: source.discoveredBy,
          extractedBy: source.extractedBy,
          fallbackExtractionUsed: source.fallbackExtractionUsed,
        })),
        citationReport: citationStatus,
        sourceContract: strictSourceContract,
        sourceGapReport: pipelineResult.sourceGapReport,
        qualityGateReport: pipelineResult.qualityGate,
        sourceUsageValidationReports: sourceUsageFailureReports,
        divisionOutputs: pipelineResult.divisionOutputs,
        providerRuntime: {
          providerErrors,
        },
        bucketCoverage: pipelineResult.evidenceRegistry.getBucketCoverage(),
        agenda: {
          normalizedAgenda: pipelineResult.agendaContract.normalizedAgenda,
          topicType: pipelineResult.agendaContract.topicType,
          minimumUniqueCitedSources: pipelineResult.agendaContract.minimumUniqueCitedSources,
        },
        degradedFallbackUsed: pipelineResult.coreAnswerResult?.degradedFallbackUsed,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        fallbackUsed: pipelineResult.fallbackUsed,
        fallbackReason: pipelineResult.fallbackReason,
        fallbackCode: pipelineResult.fallbackCode,
      });
      if (terminalStatus === "failed" || terminalStatus === "provider_error") {
        const failureMessage = sourceUsageFailedRoles.length > 0
          ? "Source usage validation failed. The model listed sources without extracting/supporting claims."
          : terminalDecision.errorCode === "EMPTY_FINAL_ANSWER"
            ? "Final answer was empty after hidden metadata was stripped."
          : pipelineResult.qualityGate.repairRequired
            ? "This brief didn't meet the citation bar after a repair pass. Send the motion again, or switch to Deep Research."
            : "This brief didn't cite enough of the sources we found. Open the thread and try again.";
        const keptAnswer = snapshot.finalAnswer.trim();
        await persistAssistantFailed({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage?.id,
          title: modeAwareFailureTitle(effectiveResearchMode, terminalStatus),
          message: failureMessage,
          partialContent: keptAnswer || undefined,
          metadata: {
            runId,
            requestId,
            conversationId,
            assistantMessageId: assistantMessage?.id,
            queryHash: runIdentity.queryHash,
            researchMode: effectiveResearchMode,
            terminalStatus,
            coreGenerationUsed: pipelineResult.usedCoreGeneration,
            legacyFallbackUsed: pipelineResult.usedLegacyFallback,
            liveRetrievalUsed: true,
            error: { code: terminalDecision.errorCode ?? "SOURCE_CONTRACT_FAILED", message: failureMessage, recoverable: true },
            sourceUsageFailureReports,
            providerErrors,
            sourceContract: strictSourceContract,
            sourceGapReport: pipelineResult.sourceGapReport,
            qualityGate: pipelineResult.qualityGate,
            citationStatus,
            citationReport: snapshot.citationReport,
            divisionOutputs: snapshot.divisionOutputs,
            qualityGateReport: snapshot.qualityGateReport,
            sources: snapshot.sources,
          } as any,
        });
        sendRunEvent("failed", {
          done: true,
          terminalStatus,
          code: terminalDecision.errorCode ?? (sourceUsageFailedRoles.length > 0 ? "SOURCE_USAGE_VALIDATION_FAILED" : "SOURCE_CONTRACT_FAILED"),
          message: failureMessage,
          retryable: true,
          sourceContract,
          sourceGapReport: pipelineResult.sourceGapReport,
          sourceUsageFailureReports,
          divisionOutputs: snapshot.divisionOutputs,
          diagnostics: { citationReport: snapshot.citationReport, qualityGateReport: snapshot.qualityGateReport },
        });
        writer.finishStream();
        return;
      }
      // Only send the full answer as a batch if NO tokens were streamed incrementally.
      // When streaming worked, the frontend already has the complete text from accumulated
      // answer_delta chunks — sending it again would duplicate the content.
      if (streamedTokenCount === 0) {
        sendRunEvent("answer_delta", { content: pipelineResult.finalAnswer });
      }
      sendRunEvent("division_outputs", { divisionOutputs: snapshot.divisionOutputs });
      sendRunEvent(terminalStatus, {
        done: true,
        terminalStatus,
        coreGenerationUsed: pipelineResult.usedCoreGeneration,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        liveRetrievalUsed: true,
        sourceGapReport: pipelineResult.sourceGapReport,
        sourceUsageFailureReports: sourceUsageWarningRoles.map((role) => role.sourceUsageFailureReport).filter(Boolean),
        citationReport: snapshot.citationReport,
        qualityGateReport: snapshot.qualityGateReport,
        sourceContract: snapshot.sourceContract,
        divisionOutputs: snapshot.divisionOutputs,
        sources: snapshot.sources,
      });
      const persistedMetadata = {
        runId,
        requestId,
        conversationId,
        assistantMessageId: assistantMessage?.id,
        queryHash: runIdentity.queryHash,
        researchMode: effectiveResearchMode,
        terminalStatus,
        coreGenerationUsed: pipelineResult.usedCoreGeneration,
        legacyFallbackUsed: pipelineResult.usedLegacyFallback,
        liveRetrievalUsed: true,
        sourceContract: strictSourceContract,
        sourceGapReport: pipelineResult.sourceGapReport,
        qualityGate: pipelineResult.qualityGate,
        citationStatus,
        sourceUsageFailureReports,
        providerErrors,
        degradedFallbackUsed: pipelineResult.coreAnswerResult?.degradedFallbackUsed,
        deterministicCitedFallbackUsed: pipelineResult.coreAnswerResult?.deterministicCitedFallbackUsed,
        citationRepairAttempted: pipelineResult.coreAnswerResult?.citationRepairAttempted,
        citationRepairSucceeded: pipelineResult.coreAnswerResult?.citationRepairSucceeded,
        divisionOutputs: snapshot.divisionOutputs,
        citationReport: snapshot.citationReport,
        qualityGateReport: snapshot.qualityGateReport,
        sourceUsageValidationReports: sourceUsageFailureReports,
        repairPasses: [],
        bucketCoverage: pipelineResult.evidenceRegistry.getBucketCoverage(),
        legacyDebug: { mode: effectiveResearchMode, models: [], discussion: null },
        sources: snapshot.sources,
      } as any;
      const persistedContent = embedPipelineMeta(snapshot.finalAnswer, persistedMetadata);
      if (assistantMessage?.id) {
        await persistRunSnapshot({
          store: assistantPersistenceStore,
          conversationId,
          assistantMessageId: assistantMessage.id,
          snapshot,
        });
        if (!input.isDisconnected()) {
          await maybeMergeArchive({
            terminalStatus,
            qualityGate: pipelineResult.qualityGate,
            legacyFallbackUsed: pipelineResult.usedLegacyFallback,
            sourceContract: strictSourceContract,
            finalAnswer: pipelineResult.finalAnswer,
            merge: () => input.mergeArchive(pipelineResult.finalAnswer),
          });
        }
      }
      writer.finishStream();
}

async function loadSavedArchiveAngles(archiveId: number | null | undefined): Promise<string[]> {
  if (!archiveId) return [];
  try {
    const row = await getArchiveResearchAngles(archiveId);
    if (!row?.angles_json) return [];
    const parsed = JSON.parse(row.angles_json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((angle): angle is string => typeof angle === "string" && angle.trim().length > 0);
  } catch {
    return [];
  }
}
