export const PIPELINE_METADATA_START = "<!--BESTDEL_PIPELINE_START-->";
export const PIPELINE_METADATA_END = "<!--BESTDEL_PIPELINE_END-->";

export type ResearchTerminalStatus =
  | "completed"
  | "completed_with_source_gaps"
  | "degraded_fallback"
  | "failed"
  | "provider_error"
  | "legacy_fallback_used"
  | "cancelled";

export type PipelineResearchMode = "fast_research" | "deep_research" | "council";

export interface PipelineSourceContractMetadata {
  requiredSources: number;
  citationEligibleSources: number;
  finalUniqueCitedSources: number;
  passedStrict: boolean;
  passedWithSourceGaps: boolean;
  passed: boolean;
  status: "passed" | "passed_with_source_gaps" | "failed";
  reason: string;
}

export interface PipelineMetadata {
  runId: string;
  requestId: string;
  conversationId: number | string;
  assistantMessageId: number | string;
  queryHash: string;
  researchMode: PipelineResearchMode;
  terminalStatus: ResearchTerminalStatus;
  coreGenerationUsed: boolean;
  legacyFallbackUsed: boolean;
  liveRetrievalUsed: boolean;
  sourceContract: PipelineSourceContractMetadata;
  sourceGapReport?: unknown;
  qualityGate?: {
    passed: boolean;
    score: number;
    repairRequired: boolean;
    categoryScores?: Record<string, number>;
    automaticFailures?: string[];
    warnings?: string[];
  } | null;
  qualityGateReport?: unknown;
  citationStatus?: {
    finalUniqueCitedSources: number;
    totalLinkedCitations: number;
    citedSourceIds: number[];
    citationCoverage: number;
    invalidCitations?: string[];
    citedBuckets?: string[];
  } | null;
  citationReport?: unknown;
  divisionOutputs?: Record<string, string>;
  repairPasses?: unknown[];
  sourceUsageValidationReports?: unknown[];
  fallbackUsed?: boolean;
  fallbackReason?: string;
  fallbackCode?: string;
  tokenCostUsage?: unknown;
  agenda?: unknown;
  error?: unknown;
  sourceUsageFailureReports?: unknown[];
  providerErrors?: unknown[];
  degradedFallbackUsed?: boolean;
  citationRepairAttempted?: boolean;
  citationRepairSucceeded?: boolean;
  deterministicCitedFallbackUsed?: boolean;
  underCitationReason?: string;
  providerRuntime?: {
    searchProvidersUsed?: string[];
    extractionProvidersUsed?: string[];
    providerFailures?: unknown[];
    sourceCountsByProvider?: Record<string, number>;
    extractionProviderBreakdown?: Record<string, number>;
    fallbackExtractionCount?: number;
  };
  bucketCoverage?: Record<string, number>;
  sources?: Array<{
    sourceId?: number;
    title: string;
    url: string;
    sourceType?: string;
    bucketIds?: string[];
    cited?: boolean;
    discoveredBy?: string[];
    extractedBy?: string;
    fallbackExtractionUsed?: boolean;
  }>;
  legacyDebug?: {
    mode?: string;
    models?: unknown[];
    discussion?: string | null;
  };
  // Backward compatibility for already persisted legacy-only pipeline panels.
  mode?: string;
  models?: unknown[];
  discussion?: string | null;
}

const NEW_MARKER_RE = /\n*\s*<!--BESTDEL_PIPELINE_START-->\s*([\s\S]*?)\s*<!--BESTDEL_PIPELINE_END-->\s*/g;
const OLD_INLINE_START_RE = /\n*\s*<!--BESTDEL_PIPELINE_START:([\s\S]*?)-->\s*/g;
const OLD_MARKER_RE = /\n*\s*<!--BESTDEL_PIPELINE:([\s\S]*?)-->\s*/g;
const UNCLOSED_MARKER_RE = /\n*\s*<!--BESTDEL_PIPELINE(?:_START(?::|-->)?|:)[\s\S]*$/g;

export function embedPipelineMetadata(content: string, meta: PipelineMetadata | Record<string, unknown>): string {
  try {
    const clean = stripPipelineMetadata(content).trimEnd();
    const json = JSON.stringify(meta, null, 2);
    return `${clean}\n\n${PIPELINE_METADATA_START}\n${json}\n${PIPELINE_METADATA_END}`;
  } catch {
    return stripPipelineMetadata(content).trimEnd();
  }
}

export function hasPipelineMetadata(content: string): boolean {
  return /<!--BESTDEL_PIPELINE/.test(content);
}

export function stripPipelineMetadata(content: string): string {
  return content
    .replace(NEW_MARKER_RE, "")
    .replace(OLD_INLINE_START_RE, "")
    .replace(OLD_MARKER_RE, "")
    .replace(UNCLOSED_MARKER_RE, "")
    .trimEnd();
}

export function extractPipelineMetadata(content: string): PipelineMetadata | null {
  let metadata: PipelineMetadata | null = null;
  for (const json of collectMetadataJsonBlocks(content)) {
    try {
      metadata = JSON.parse(json) as PipelineMetadata;
    } catch {
      // Keep looking: a message can contain one malformed legacy marker and a later valid marker.
    }
  }
  return metadata;
}

function collectMetadataJsonBlocks(content: string): string[] {
  const blocks: string[] = [];
  for (const pattern of [NEW_MARKER_RE, OLD_INLINE_START_RE, OLD_MARKER_RE]) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      blocks.push(match[1]);
    }
  }
  return blocks;
}
