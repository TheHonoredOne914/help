export type PipelineTerminalStatus =
  | "completed"
  | "completed_with_source_gaps"
  | "degraded_fallback"
  | "failed"
  | "provider_error"
  | "legacy_fallback_used"
  | "cancelled";

export interface PipelineMetadata {
  runId?: string;
  requestId?: string;
  conversationId?: number | string;
  assistantMessageId?: number | string;
  queryHash?: string;
  researchMode?: "fast_research" | "deep_research" | "deep_research" | "council";
  terminalStatus?: PipelineTerminalStatus;
  coreGenerationUsed?: boolean;
  legacyFallbackUsed?: boolean;
  liveRetrievalUsed?: boolean;
  sourceContract?: {
    requiredSources?: number;
    citationEligibleSources?: number;
    finalUniqueCitedSources?: number;
    passedStrict?: boolean;
    passedWithSourceGaps?: boolean;
    passed?: boolean;
    status?: "passed" | "passed_with_source_gaps" | "failed";
    reason?: string;
  };
  sourceGapReport?: {
    requiredUniqueSources?: number;
    availableCitationEligibleSources?: number;
    failedBuckets?: string[];
    weakBuckets?: string[];
    explanation?: string;
  } | null;
  qualityGate?: {
    passed?: boolean;
    score?: number;
    repairRequired?: boolean;
    categoryScores?: Record<string, number>;
    automaticFailures?: string[];
    warnings?: string[];
  } | null;
  citationStatus?: {
    finalUniqueCitedSources?: number;
    totalLinkedCitations?: number;
    citedSourceIds?: number[];
    citationCoverage?: number;
    invalidCitations?: string[];
    rejectedCitations?: string[];
    citedBuckets?: string[];
    missingSourceBuckets?: string[];
  } | null;
  promptBudgetReports?: Array<{
    providerName?: string;
    model?: string;
    estimatedInputTokens?: number;
    maxInputTokens?: number;
    originalSources?: number;
    includedSources?: number;
    originalPacks?: number;
    includedPacks?: number;
    compressionApplied?: boolean;
    compressionLevel?: number;
    truncatedSections?: string[];
  }>;
  sourceUsageFailureReports?: unknown[];
  providerErrors?: unknown[];
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
    models?: LegacyPipelineModel[];
    discussion?: string | null;
  };
  mode?: string;
  models?: LegacyPipelineModel[];
  discussion?: string | null;
}

export interface PipelineMetadataIdentity {
  runId?: number | string | null;
  conversationId?: number | string | null;
  assistantMessageId?: number | string | null;
}

export interface LegacyPipelineModel {
  key: string;
  label: string;
  searches: string[];
  found: { title: string; url: string; engine?: string; sourceType?: string }[];
  exhausted: { reason: "rate_limit" | "error" } | null;
}

const NEW_MARKER_RE = /\n*\s*<!--BESTDEL_PIPELINE_START-->\s*([\s\S]*?)\s*<!--BESTDEL_PIPELINE_END-->\s*/g;
const OLD_INLINE_START_RE = /\n*\s*<!--BESTDEL_PIPELINE_START:([\s\S]*?)-->\s*/g;
const OLD_MARKER_RE = /\n*\s*<!--BESTDEL_PIPELINE:([\s\S]*?)-->\s*/g;
const UNCLOSED_MARKER_RE = /\n*\s*<!--BESTDEL_PIPELINE(?:_START(?::|-->)?|:)[\s\S]*$/g;

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

export function extractPipelineMetadata(content: string, expectedIdentity?: number | string | PipelineMetadataIdentity): {
  cleanContent: string;
  metadata: PipelineMetadata | null;
  parseError: boolean;
} {
  const cleanContent = stripPipelineMetadata(content);
  const identity = normalizeExpectedIdentity(expectedIdentity);
  let metadata: PipelineMetadata | null = null;
  let sawMarker = false;
  let parseError = false;

  for (const json of collectMetadataJsonBlocks(content)) {
    sawMarker = true;
    try {
      const parsed = JSON.parse(json) as PipelineMetadata;
      if (!metadataIdentityMatches(parsed, identity)) continue;
      metadata = parsed;
    } catch {
      parseError = true;
    }
  }

  const isDev = typeof import.meta !== "undefined" && Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  if (sawMarker && !metadata && isDev) {
    console.warn("Pipeline metadata could not be parsed.");
  }

  return { cleanContent, metadata, parseError };
}

function normalizeExpectedIdentity(expected?: number | string | PipelineMetadataIdentity): PipelineMetadataIdentity {
  if (expected == null) return {};
  if (typeof expected === "object") return expected;
  return { assistantMessageId: expected };
}

function metadataIdentityMatches(parsed: PipelineMetadata, expected: PipelineMetadataIdentity): boolean {
  return identityFieldMatches(parsed.runId, expected.runId)
    && identityFieldMatches(parsed.conversationId, expected.conversationId)
    && identityFieldMatches(parsed.assistantMessageId, expected.assistantMessageId);
}

function identityFieldMatches(actual: number | string | null | undefined, expected: number | string | null | undefined): boolean {
  if (expected == null) return true;
  if (actual == null) return false;
  return String(actual) === String(expected);
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
