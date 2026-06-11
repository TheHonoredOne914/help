import type { PipelineEvent, PipelineEventType } from "./pipeline-events.js";
import { logger } from "../../lib/logger.js";

export interface PipelineTelemetrySummary {
  requestId: string;
  events: number;
  lastEventType: string | null;
}

export interface ResearchExecutionTrace {
  requestId: string;
  runId?: string;
  conversationId?: number | string;
  researchMode?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  stages: ExecutionStage[];
  providerLatencies: ProviderLatency[];
  crawlerFailures: CrawlerFailure[];
  extractionFailures: ExtractionFailure[];
  sourceCounts: SourceCountSnapshot;
  reranking?: RerankingInfo;
  synthesisTiming?: SynthesisTiming;
  citationValidationFailures: CitationValidationFailure[];
  streamLifecycle: StreamLifecycleEvent[];
  fallbackActivations: FallbackActivation[];
  errors: PipelineError[];
  status: "running" | "completed" | "failed" | "completed_with_source_gaps";
}

export interface ExecutionStage {
  name: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderLatency {
  provider: string;
  model?: string;
  operation: "search" | "extraction" | "source_usage" | "core_generation";
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface CrawlerFailure {
  url: string;
  provider: string;
  error: string;
  timestamp: string;
}

export interface ExtractionFailure {
  url: string;
  provider: string;
  method: string;
  error: string;
  timestamp: string;
}

export interface SourceCountSnapshot {
  rawResults: number;
  afterDedup: number;
  afterFilter: number;
  afterEnrichment: number;
  citationEligible: number;
  usedInSynthesis: number;
  failedBuckets: string[];
  weakBuckets: string[];
}

export interface RerankingInfo {
  reranker: string;
  inputSources: number;
  outputSources: number;
  latencyMs: number;
}

export interface SynthesisTiming {
  promptBuildingMs: number;
  providerCallMs: number;
  repairPasses: number;
  totalMs: number;
}

export interface CitationValidationFailure {
  sourceId: number;
  reason: string;
  citationText: string;
}

export interface StreamLifecycleEvent {
  type: string;
  timestamp: string;
  runId?: string;
  assistantMessageId?: string | number;
  data?: Record<string, unknown>;
}

export interface FallbackActivation {
  fallbackType: "search_provider" | "extraction_provider" | "source_usage_provider" | "core_generation" | "deterministic";
  activatedAt: string;
  reason: string;
  severity: "compatibility" | "degraded" | "failure";
  originalFailure?: string;
}

export interface PipelineError {
  stage: string;
  error: string;
  timestamp: string;
  recoverable: boolean;
}

class ResearchExecutionTraceManager {
  private traces = new Map<string, ResearchExecutionTrace>();

  createTrace(requestId: string, options?: { runId?: string; conversationId?: number | string; researchMode?: string }): ResearchExecutionTrace {
    const trace: ResearchExecutionTrace = {
      requestId,
      runId: options?.runId,
      conversationId: options?.conversationId,
      researchMode: options?.researchMode,
      startedAt: new Date().toISOString(),
      stages: [],
      providerLatencies: [],
      crawlerFailures: [],
      extractionFailures: [],
      sourceCounts: {
        rawResults: 0,
        afterDedup: 0,
        afterFilter: 0,
        afterEnrichment: 0,
        citationEligible: 0,
        usedInSynthesis: 0,
        failedBuckets: [],
        weakBuckets: [],
      },
      citationValidationFailures: [],
      streamLifecycle: [],
      fallbackActivations: [],
      errors: [],
      status: "running",
    };
    this.traces.set(requestId, trace);
    return trace;
  }

  getTrace(requestId: string): ResearchExecutionTrace | undefined {
    return this.traces.get(requestId);
  }

  stageStarted(trace: ResearchExecutionTrace, stageName: string, metadata?: Record<string, unknown>): void {
    trace.stages.push({
      name: stageName,
      startedAt: new Date().toISOString(),
      success: true,
      metadata,
    });
    logger.debug({ requestId: trace.requestId, stage: stageName }, "Pipeline stage started");
  }

  stageCompleted(trace: ResearchExecutionTrace, stageName: string, success: boolean = true, error?: string): void {
    const stage = trace.stages.find((s) => s.name === stageName && !s.completedAt);
    if (stage) {
      const now = new Date().toISOString();
      stage.completedAt = now;
      stage.durationMs = new Date(now).getTime() - new Date(stage.startedAt).getTime();
      stage.success = success;
      stage.error = error;
      logger.debug({ requestId: trace.requestId, stage: stageName, durationMs: stage.durationMs, success }, "Pipeline stage completed");
    }
  }

  recordProviderLatency(trace: ResearchExecutionTrace, latency: ProviderLatency): void {
    trace.providerLatencies.push(latency);
    if (!latency.success) {
      logger.warn({ requestId: trace.requestId, provider: latency.provider, operation: latency.operation, error: latency.error }, "Provider operation failed");
    }
  }

  recordCrawlerFailure(trace: ResearchExecutionTrace, failure: CrawlerFailure): void {
    trace.crawlerFailures.push(failure);
    logger.error({ requestId: trace.requestId, url: failure.url, provider: failure.provider, error: failure.error }, "Crawler failed");
  }

  recordExtractionFailure(trace: ResearchExecutionTrace, failure: ExtractionFailure): void {
    trace.extractionFailures.push(failure);
    logger.warn({ requestId: trace.requestId, url: failure.url, provider: failure.provider, method: failure.method }, "Extraction failed");
  }

  updateSourceCounts(trace: ResearchExecutionTrace, counts: Partial<SourceCountSnapshot>): void {
    Object.assign(trace.sourceCounts, counts);
  }

  recordStreamEvent(trace: ResearchExecutionTrace, event: StreamLifecycleEvent): void {
    trace.streamLifecycle.push(event);
    if (event.type === "terminal" || event.type === "done" || event.type === "completed") {
      logger.debug({ requestId: trace.requestId, eventType: event.type }, "Stream terminal event");
    }
  }

  recordFallbackActivation(trace: ResearchExecutionTrace, activation: FallbackActivation): void {
    trace.fallbackActivations.push(activation);
    logger.warn({ requestId: trace.requestId, fallbackType: activation.fallbackType, severity: activation.severity, reason: activation.reason }, "Fallback activated");
  }

  recordError(trace: ResearchExecutionTrace, error: PipelineError): void {
    trace.errors.push(error);
    logger.error({ requestId: trace.requestId, stage: error.stage, error: error.error, recoverable: error.recoverable }, "Pipeline error");
  }

  completeTrace(trace: ResearchExecutionTrace, status: ResearchExecutionTrace["status"]): void {
    const now = new Date().toISOString();
    trace.completedAt = now;
    trace.durationMs = new Date(now).getTime() - new Date(trace.startedAt).getTime();
    trace.status = status;

    logger.info({
      requestId: trace.requestId,
      researchMode: trace.researchMode,
      durationMs: trace.durationMs,
      status,
      stagesCompleted: trace.stages.filter((s) => s.completedAt).length,
      sourceCounts: trace.sourceCounts,
      errors: trace.errors.length,
      fallbacks: trace.fallbackActivations.length,
    }, "Pipeline execution trace complete");

    this.traces.delete(trace.requestId);
  }

  logTraceSummary(trace: ResearchExecutionTrace): void {
    const failedStages = trace.stages.filter((s) => !s.success);
    const totalProviderLatency = trace.providerLatencies.reduce((sum, p) => sum + p.latencyMs, 0);

    logger.info({
      requestId: trace.requestId,
      summary: {
        status: trace.status,
        durationMs: trace.durationMs,
        totalStages: trace.stages.length,
        failedStages: failedStages.length,
        failedStageNames: failedStages.map((s) => s.name),
        totalProviderLatencyMs: totalProviderLatency,
        providerOperations: trace.providerLatencies.length,
        searchProviderFailures: trace.crawlerFailures.length,
        extractionFailures: trace.extractionFailures.length,
        fallbackCount: trace.fallbackActivations.length,
        errorCount: trace.errors.length,
        sourceCounts: trace.sourceCounts,
      },
    }, "Research execution trace summary");
  }
}

export const traceManager = new ResearchExecutionTraceManager();

export function summarizePipelineTelemetry(requestId: string, events: PipelineEvent[]): PipelineTelemetrySummary {
  return {
    requestId,
    events: events.length,
    lastEventType: events.at(-1)?.type ?? null,
  };
}

export function createTraceFromPipelineEvents(requestId: string, events: PipelineEvent[]): ResearchExecutionTrace {
  const trace = traceManager.createTrace(requestId);

  for (const event of events) {
    if (event.type === "bucket_search_started") {
      traceManager.stageStarted(trace, "retrieval", event.data as Record<string, unknown>);
    } else if (event.type === "bucket_search_completed") {
      traceManager.stageCompleted(trace, "retrieval", true);
      traceManager.updateSourceCounts(trace, { rawResults: Number(event.data?.rawResults) || 0 });
    } else if (event.type === "source_dedup_completed") {
      traceManager.updateSourceCounts(trace, { afterDedup: Number(event.data?.kept) || 0 });
    } else if (event.type === "source_filter_completed") {
      traceManager.updateSourceCounts(trace, { afterFilter: Number(event.data?.kept) || 0 });
    } else if (event.type === "source_enrichment_completed") {
      traceManager.updateSourceCounts(trace, { afterEnrichment: Number(event.data?.enriched) || 0 });
    } else if (event.type === "source_usage_completed") {
      traceManager.stageCompleted(trace, "source_usage", true);
      traceManager.updateSourceCounts(trace, { usedInSynthesis: Number(event.data?.validUsageCount) || 0 });
    } else if (event.type === "core_generation_started") {
      traceManager.stageStarted(trace, "core_generation");
    } else if (event.type === "final_answer_ready") {
      traceManager.stageCompleted(trace, "core_generation", true);
      const status = event.data?.usedLegacyFallback === true || event.data?.degraded === true
        ? "completed_with_source_gaps"
        : "completed";
      traceManager.completeTrace(trace, status);
    } else if (event.type === "pipeline_failed") {
      traceManager.stageCompleted(trace, "pipeline", false, String(event.data?.reason || "unknown"));
      traceManager.recordError(trace, {
        stage: "pipeline",
        error: String(event.data?.reason || "unknown"),
        timestamp: new Date().toISOString(),
        recoverable: Boolean(event.data?.fallbackEligible),
      });
      traceManager.completeTrace(trace, "failed");
    } else if (event.type === "legacy_fallback_used") {
      traceManager.recordFallbackActivation(trace, {
        fallbackType: "core_generation",
        activatedAt: new Date().toISOString(),
        reason: String(event.data?.fallbackReason || "unknown"),
        severity: event.data?.degraded === true ? "degraded" : "compatibility",
        originalFailure: event.data?.originalFailureType as string | undefined,
      });
    }
  }

  return trace;
}