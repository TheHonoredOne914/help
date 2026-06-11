// src/lib/types.ts
// ─────────────────────────────────────────────────────────────
// Shared type definitions for the Antigravity provider system.
// ALL other modules import from here — never redefine locally.
// ─────────────────────────────────────────────────────────────

import type { Passage } from "./passage-engine.js";

export type ProviderName = "groq" | "ollama" | "nvidia" | "gemini" | "openrouter" | "github" | "cerebras" | "openai";

export type ChatMode = "normal" | "web_search" | "deep_research";

export type MunIntent = "research" | "criticism" | "debate" | "speech" | "poi";

/**
 * All API keys extracted from a single HTTP request.
 * Populated once per request in the route handler, then passed down.
 */
export interface RequestKeys {
  groqKey:        string | null;
  ollamaKey:      string | null;
  ollamaBase:     string | null;
  nvidiaKey:      string | null;
  geminiKey:      string | null;
  openrouterKey:  string | null;
  githubToken:    string | null;
  tavilyKey:      string | null;
  hfToken:        string | null;
  serperKey:      string | null;
  exaKey?:        string | null;
  braveKey:       string | null;
  firecrawlKey?:  string | null;
  jinaKey:        string | null;
  scraperapiKey?: string | null;
  zenrowsKey?:    string | null;
  scrapingbeeKey?: string | null;
  geekflareKey?: string | null;
  cerebrasKey?:   string | null;
  openaiKey?:     string | null;
}

/**
 * The resolved provider client + stripped model ID + provider label.
 * Returned by getProviderClient().
 */
export interface ResolvedProvider {
  client:   any;         // OpenAI-compat SDK instance
  modelId:  string;      // model ID with provider prefix stripped
  provider: ProviderName;
}

/**
 * Structured data extracted from an Indian court judgement.
 * Populated when sourceType === "court_judgement".
 */
export interface CourtJudgement {
  isJudgement: boolean;
  caseName:    string;   // e.g. "Maneka Gandhi v. Union of India"
  caseNumber:  string;   // e.g. "Writ Petition 231 of 1978"
  year:        string;   // e.g. "1978"
  court:       string;   // e.g. "Supreme Court of India"
  bench:       string;   // judges if found in content
  held:        string;   // 2-3 sentence summary of the holding
  relevance:   string;   // why this matters for MUN research (auto-generated)
  url:         string;
}

/**
 * A single web search result, post-scoring.
 */
export interface SearchResult {
  title:      string;
  url:        string;
  snippet:    string;
  engine:     "tavily" | "ddg_scrape" | "ddg_instant" | "serper" | "exa" | "brave" | "indiankanoon";
  score:      number;    // 0-10, see scoreSource()
  hasRawContent?: boolean;   // true when Tavily raw_content was used as snippet
  publishedDate?: string;    // ISO date string from Brave "age" field
  // Source classification fields (Section 1 overhaul)
  sourceType: "government_india" | "court_judgement" | "government_international" |
              "academic_india" | "legal_india" | "media_india" | "international_research" | "general";
  judgement?:  CourtJudgement;  // populated only when sourceType === "court_judgement"
  reportType?: string;           // e.g. "CAG Annual Report 2024", "NCRB Crime in India 2023"
}

/**
 * A RAG-enriched result (SearchResult + extracted page content).
 */
export interface EnrichedResult extends SearchResult {
  content: string;       // extracted via Jina Reader or Readability
  relevanceScore?: number;   // 0-1.5 float from scoreRelevance()
  combinedScore?: number;    // authority + relevance combined
}

/**
 * Verification result returned by the verify pipeline.
 */
export interface VerificationResult {
  verified:     boolean;
  confidence:   number;  // 0-100
  notes:        string;
  thinking:     string[];
  sources:      { title: string; url: string }[];
  model:        string;  // "gemini" | "qwen" | "fallback"
  modelFull:    string;  // human-readable name
}

/**
 * MUN context detected from a query.
 */
export interface MunContext {
  isMun:         boolean;
  intent:        MunIntent;
  country:       string;
  timeRelevance: "recent" | "historical";
  topic:         string;
}

export type DimensionClass = "core" | "secondary" | "tertiary";

export type DimensionName =
  | "political" | "constitutional" | "economic" | "security"
  | "human_rights" | "judiciary" | "diplomatic" | "technological"
  | "electoral" | "media_information" | "governance" | "federalism"
  | "social_stability" | "public_sentiment" | "international_relations"
  | "strategic_affairs";

export type CommitteeType =
  | "lok_sabha" | "rajya_sabha" | "aippm" | "national_security"
  | "constitutional" | "crisis" | "public_policy" | "human_rights"
  | "economic" | "foreign_affairs" | "youth_parliament" | "general";

export type AgendaClass =
  | "rights_constitutional" | "economic_fiscal" | "security_internal"
  | "federal_centrestate" | "crisis" | "governance_policy"
  | "diplomatic_foreign" | "electoral_democratic";

export type EvidenceTier = "tier1" | "tier2" | "tier3" | "tier4" | "tier5" | "untiered";

export interface DimensionScore {
  name: DimensionName;
  class: DimensionClass;
  rawScore: number;
  boostedScore: number;
  priority: "primary" | "secondary" | "background";
  triggerKeywords: string[];
}

export interface StructuralDNA {
  leadDivision: string;
  elevatedDivisions: string[];
  compressedDivisions: string[];
  evidencePriority: Exclude<EvidenceTier, "untiered">[];
  debateRegister: "combative" | "deliberative" | "technical" | "diplomatic";
  tokenBudget: Map<string, number>;
}

export interface DimensionEngineOutput {
  agendaText: string;
  committeeType: CommitteeType;
  primaryDimensions: DimensionScore[];
  secondaryDimensions: DimensionScore[];
  backgroundDimensions: DimensionScore[];
  agendaClass: AgendaClass;
  conflictSignals: string[];
  structuralDNA: StructuralDNA;
}

export interface NumberedSource {
  index: number;
  title: string;
  url: string;
  canonicalUrl: string;
  sourceType: SearchResult["sourceType"];
  tier: EvidenceTier;
  hasFullContent: boolean;
  snippet: string;
  content: string;
  judgement?: CourtJudgement;
  reportType?: string;
  score: number;
  dimensions?: string[];
}

export interface EvidenceRegistry {
  agendaText: string;
  queryTimestamp: string;
  sources: NumberedSource[];
  passages: Passage[];
  passagesByDimension: Partial<Record<DimensionName, Passage[]>>;
  topEvidencePassages: Passage[];
  semanticDuplicateCount: number;
  evidenceDensityScore: number;
  tier1Sources: NumberedSource[];
  tier2Sources: NumberedSource[];
  tier3Sources: NumberedSource[];
  tier4Sources: NumberedSource[];
  tier5Sources: NumberedSource[];
  courtJudgements: Array<{ source: NumberedSource; judgement: CourtJudgement }>;
  govReports: Array<{ source: NumberedSource; reportType: string }>;
  snippetOnlySources: NumberedSource[];
  conflictedClaims: string[];
  evidenceGaps: string[];
}

export interface DivisionQualityReport {
  divisionId: string;
  divisionName: string;
  wordCount: number;
  citationCount: number;
  specificityScore: number;
  parliamentaryRegister: boolean;
  debateOperability: boolean;
  issues: string[];
}

export interface QualityReport {
  passed: boolean;
  divisionReports: DivisionQualityReport[];
  overallScore: number;
  criticalFailures: string[];
  warnings: string[];
}

export interface EvidenceRegistrySummary {
  totalSources: number;
  tierCounts: Record<EvidenceTier, number>;
  courtJudgementCount: number;
  snippetOnlyCount: number;
  passageCount?: number;
  semanticDuplicateCount?: number;
  evidenceDensityScore?: number;
  evidenceGaps: string[];
}

export type SseEventPayload =
  | { type: "planning"; plannerModel: string }
  | { type: "dimension_scores"; scores: DimensionScore[] }
  | { type: "agenda_class"; agendaClass: string; committeeType: string }
  | { type: "division_started"; division: string; dimensionClass: "primary" | "secondary" }
  | { type: "content"; chunk: string }
  | { type: "division_complete"; division: string; wordCount: number; citationCount: number }
  | { type: "evidence_registry"; registry: EvidenceRegistrySummary }
  | { type: "verified"; verification: VerificationResult }
  | { type: "done" };

/**
 * Structured SSE event payload. sendSse() accepts this type.
 */
export type SsePayload = SseEventPayload | Record<string, unknown>;

/**
 * Batch model result from independent research.
 * CRITICAL: searchResults must be EnrichedResult[] to preserve fetched content.
 */
export interface BatchModelResult {
  modelKey: string;
  subQueries: string[];
  sources: Array<{ title: string; url: string; sourceType: SearchResult["sourceType"] }>;
  structuredData: { keyFindings: string[] };
  ragContext: string;
  searchResults: EnrichedResult[];  // CHANGED from SearchResult[] - preserves content
  judgements: CourtJudgement[];
  govReports: string[];
  stats: {
    numbers: string[];
    percentages: string[];
    years: string[];
  };
}

export interface BatchResult {
  batchName: string;
  role: string;
  modelResults: BatchModelResult[];
}
