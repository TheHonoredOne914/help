import type { SourceBucketId } from "../retrieval/source-buckets.js";

export type SourceClass =
  | "court_primary"
  | "official_government"
  | "parliamentary_records"
  | "electoral_body"
  | "democracy_index"
  | "civic_space_monitor"
  | "human_rights_watchdog"
  | "digital_rights_watchdog"
  | "press_freedom_index"
  | "academic_journal"
  | "legal_commentary"
  | "indian_major_media"
  | "policy_research"
  | "comparative_democracy"
  | "general_media"
  | "social_media"
  | "low_quality";

export type ExtractionQuality = "full" | "partial" | "snippet" | "failed";
export type CitationStrength = "strong" | "medium" | "weak" | "ineligible";

export interface TopChunk {
  text: string;
  score: number;
  chunkIndex: number;
  sourceId?: number;
}

export interface EnrichmentCard {
  [key: string]: unknown;
}

export interface EvidenceSource {
  id: number;
  title: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  bucketIds: SourceBucketId[];
  sourceClass: SourceClass;
  authorityScore: number;
  date: string | null;
  fullText: string | null;
  snippet: string | null;
  extractionQuality: ExtractionQuality;
  discoveredBy?: string[];
  extractedBy?: string;
  fallbackExtractionUsed?: boolean;
  keyFacts: string[];
  keyNumbers: string[];
  legalHoldings: string[];
  namedEntities: string[];
  limitations: string[];
  confidence: "high" | "medium" | "low";
  citationEligible: boolean;
  enrichmentCard?: EnrichmentCard;
  topChunks: TopChunk[];
  citationStrength: CitationStrength;
  limitedSource: boolean;
}

export type CompleteEvidenceSourceInput = Omit<EvidenceSource, "id">;

export type EvidenceSourceInput =
  Omit<CompleteEvidenceSourceInput, "topChunks" | "citationStrength" | "limitedSource">
  & Partial<Pick<CompleteEvidenceSourceInput, "topChunks" | "citationStrength" | "limitedSource">>;

export type RawEvidenceSourceInput =
  Omit<Partial<EvidenceSource>, "extractionQuality">
  & {
    excerpt?: string | null;
    extractionQuality?: ExtractionQuality | "high" | "medium" | "low";
    extractionProvider?: string;
    extractionStatus?: string;
    extractionMethod?: string;
    sourceChunks?: Array<{ index?: number; chunkIndex?: number; text?: string; relevanceScore?: number; score?: number }>;
    keyTermsMatched?: string[];
  };
