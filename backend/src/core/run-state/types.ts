import type { ResearchMode } from "../config/research-mode.js";
import type { PipelineSourceContractMetadata, ResearchTerminalStatus } from "../pipeline/pipeline-metadata.js";
import type { ResearchRunIdentity } from "../pipeline/pipeline-events.js";

export type { ResearchTerminalStatus, PipelineSourceContractMetadata, ResearchRunIdentity };

export type RunPhase =
  | "created"
  | "retrieval"
  | "source_usage"
  | "generation"
  | "verification"
  | "persistence"
  | "terminal";

export interface SerializedSourceSnapshot {
  sourceId?: number;
  title: string;
  url: string;
  sourceType?: string;
  bucketIds?: string[];
  cited?: boolean;
  discoveredBy?: string[];
  extractedBy?: string;
  fallbackExtractionUsed?: boolean;
}

export interface SerializedCitationReport {
  finalUniqueCitedSources: number;
  totalLinkedCitations: number;
  citedSourceIds: number[];
  citationCoverage: number;
  invalidCitations?: string[];
  rejectedCitations?: string[];
  citedBuckets?: string[];
  missingSourceBuckets?: string[];
}

export interface VisibleRunError {
  code: string;
  message: string;
  provider?: string;
  model?: string;
  httpStatus?: number;
  stage?: string;
  retryable?: boolean;
}

export interface RunResultSnapshot {
  runIdentity: ResearchRunIdentity;
  finalAnswer: string;
  terminalStatus: ResearchTerminalStatus;
  errorCode?: string;
  error?: VisibleRunError;
  sources: SerializedSourceSnapshot[];
  citedSourceIds: number[];
  citationReport: SerializedCitationReport;
  sourceContract: PipelineSourceContractMetadata;
  sourceGapReport?: unknown;
  qualityGateReport?: unknown;
  repairPasses?: unknown[];
  sourceUsageValidationReports?: unknown[];
  divisionOutputs: Record<string, string>;
  providerRuntime?: unknown;
  tokenCostUsage?: unknown;
  bucketCoverage?: Record<string, number>;
  agenda?: unknown;
  degradedFallbackUsed?: boolean;
  legacyFallbackUsed?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  fallbackCode?: string;
  researchMode?: ResearchMode;
}

export interface PersistedRunRecord {
  runId: string;
  conversationId: number | string;
  assistantMessageId?: number | string | null;
  phase: RunPhase;
  status: "running" | "interrupted" | ResearchTerminalStatus;
  startedAt: string;
  lastHeartbeatAt: string;
}

export interface RunCacheTags {
  runId?: string;
  status?: ResearchTerminalStatus | "running" | "partial";
  providerError?: boolean;
  allowPartialReuse?: boolean;
}
