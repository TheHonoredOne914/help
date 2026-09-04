import { createHash } from "node:crypto";

import type { ResearchRunIdentity } from "../../core/pipeline/pipeline-events.js";
import { embedPipelineMetadata } from "../../core/pipeline/pipeline-metadata.js";
import { inferResearchMode, type ResearchMode } from "../../core/config/research-mode.js";
import { envelopeRunEvent as buildRunEventEnvelope } from "../../core/streaming/run-stream/index.js";

export interface PipelineMetadata {
  runId?: string;
  requestId?: string;
  conversationId?: number | string;
  assistantMessageId?: number | string;
  queryHash?: string;
  researchMode?: ResearchMode;
  terminalStatus?: "completed" | "completed_with_source_gaps" | "degraded_fallback" | "failed" | "provider_error" | "legacy_fallback_used" | "cancelled";
  coreGenerationUsed?: boolean;
  legacyFallbackUsed?: boolean;
  liveRetrievalUsed?: boolean;
  sourceContract?: {
    requiredSources: number;
    citationEligibleSources: number;
    finalUniqueCitedSources: number;
    passedStrict?: boolean;
    passedWithSourceGaps?: boolean;
    passed: boolean;
    status?: "passed" | "passed_with_source_gaps" | "failed";
    reason?: string;
  };
  sourceGapReport?: unknown;
  qualityGate?: unknown;
  citationStatus?: unknown;
  sourceUsageFailureReports?: unknown;
  providerErrors?: unknown;
  councilSession?: unknown;
  degradedFallbackUsed?: boolean;
  deterministicCitedFallbackUsed?: boolean;
  citationRepairAttempted?: boolean;
  citationRepairSucceeded?: boolean;
  underCitationReason?: string;
  bucketCoverage?: unknown;
  mode?: "web_search" | "deep_research" | ResearchMode;
  models?: {
    key: string;
    label: string;
    searches: string[];
    found: { title: string; url: string; engine?: string; sourceType?: string }[];
    exhausted: { reason: "rate_limit" | "error" } | null;
  }[];
  discussion?: string | null;
  sources?: { sourceId?: number; title: string; url: string; sourceType?: string; bucketIds?: string[]; cited?: boolean }[];
  legacyDebug?: unknown;
  error?: { code?: string; message?: string; recoverable?: boolean };
}

export function embedPipelineMeta(content: string, meta: PipelineMetadata): string {
  return embedPipelineMetadata(content, meta as unknown as Record<string, unknown>);
}

export function queryHashFor(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function isResearchRouteMode(mode: string): boolean {
  return mode === "web_search" || mode === "deep_research" || mode === "fast_research" || mode === "council";
}

export function normalizeEffectiveResearchMode(userContent: string, mode: string, selected?: ResearchMode): ResearchMode {
  if (selected) return selected;
  if (mode === "fast_research" || mode === "deep_research" || mode === "council") return mode;
  return inferResearchMode(userContent, mode === "web_search" ? "web_search" : "deep_research");
}

export function coreProviderNameFromModel(model: string): string | undefined {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : undefined;
}

export function modeAwareFailureTitle(mode: ResearchMode, terminalStatus: string): string {
  if (terminalStatus === "cancelled") return "Research Cancelled";
  if (terminalStatus === "provider_error") return "Provider Error";
  switch (mode) {
    case "fast_research":
      return "Fast Research Failed";
    case "deep_research":
      return "Deep Research Failed";
    case "council":
      return "Council Research Failed";
    default:
      return "Response Failed";
  }
}

export function envelopeRunEvent(identity: ResearchRunIdentity, eventType: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
  return buildRunEventEnvelope(identity, eventType, payload);
}

export function normalizeLegacySsePayload(identity: ResearchRunIdentity | undefined, payload: Record<string, unknown>): Record<string, unknown> {
  if (!identity) return payload;
  const eventType = typeof payload.eventType === "string"
    ? payload.eventType
    : typeof payload.type === "string"
      ? payload.type
      : typeof payload.content === "string"
        ? "answer_delta"
        : "legacy_event";
  return envelopeRunEvent(identity, eventType, {
    diagnostics: payload.diagnostics ?? {
      legacyPath: true,
      terminalStatus: payload.terminalStatus ?? null,
      code: payload.code ?? null,
      error: payload.error ?? null,
    },
    ...payload,
  });
}

export function buildLegacyTerminalMetadata(
  identity: ResearchRunIdentity | undefined,
  terminalStatus: PipelineMetadata["terminalStatus"],
  extra: PipelineMetadata = {},
): PipelineMetadata {
  return {
    runId: identity?.runId,
    requestId: identity?.requestId,
    conversationId: identity?.conversationId,
    assistantMessageId: identity?.assistantMessageId,
    queryHash: identity?.queryHash,
    researchMode: identity?.researchMode,
    terminalStatus,
    coreGenerationUsed: false,
    legacyFallbackUsed: terminalStatus === "legacy_fallback_used" || extra.legacyFallbackUsed === true,
    liveRetrievalUsed: extra.liveRetrievalUsed ?? true,
    ...extra,
  };
}
