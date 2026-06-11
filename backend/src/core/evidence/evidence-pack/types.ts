import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ResearchMode } from "../../config/research-mode.js";
import type { SourceBucketId } from "../../retrieval/source-buckets.js";
import type { CitationStrength, EnrichmentCard, ExtractionQuality, SourceClass, TopChunk } from "../evidence-registry-types.js";

export interface EvidenceCard {
  sourceId: number;
  citation: string;
  title: string;
  url: string;
  sourceClass: SourceClass;
  bucketIds: SourceBucketId[];
  date: string | null;
  relevanceScore: number;
  queryRelevanceScore?: number;
  rankScore?: number;
  roleRelevanceScore?: number;
  keyFacts: string[];
  keyNumbers: string[];
  legalHoldings: string[];
  governmentPosition: string | null;
  civilLibertiesPosition: string | null;
  electoralIntegrityPosition: string | null;
  debateUse: string;
  limitations: string[];
  usableSections: string[];
  contentPreview?: string;
  citationStrength: CitationStrength;
  topChunks: TopChunk[];
  limitedSource: boolean;
  extractionQuality: ExtractionQuality;
  enrichmentCard?: EnrichmentCard;
  evidenceItems?: unknown[];
  namedEntities: string[];
}

export interface EvidencePack {
  id: string;
  cards: EvidenceCard[];
  limitations: string[];
}

export interface EvidencePackBuildOptions {
  query?: string;
  mode?: ResearchMode;
  outputDepth?: AgendaContract["outputDepth"];
  requiredBuckets?: SourceBucketId[];
  maxCardsPerPack?: number;
}

export interface RolePackStrategy {
  id: string;
  label: string;
  preferredBuckets: SourceBucketId[];
  preferredSourceClasses: SourceClass[];
  secondaryBuckets?: SourceBucketId[];
  includeWeakForCritique?: boolean;
  preferNumbers?: boolean;
  preferLegal?: boolean;
  preferDiversity?: boolean;
  preferCitationStrength?: boolean;
  safeDefault?: boolean;
  warning?: string;
}

export interface RankEvidenceOptions {
  query?: string;
  roleStrategy?: RolePackStrategy;
}
