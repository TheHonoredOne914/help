import { logger } from "./logger.js";
import { telemetry } from "./telemetry.js";
import type { QualityReport } from "./types.js";

export interface ResearchEvalRecord {
  requestId: string;
  timestamp: string;
  agendaText: string;
  committeeType: string;
  agendaClass: string;
  primaryDimensions: string[];
  
  // Retrieval metrics
  totalSourcesRetrieved: number;
  tier1Count: number;
  tier2Count: number;
  courtJudgementCount: number;
  snippetOnlyPct: number;
  evidenceGaps: string[];
  
  // Division quality
  divisionQualityReport: QualityReport;
  totalGenerationMs: number;
  divisionGenerationMs: Record<string, number>;
  
  // Output quality
  citationCoverage: number;
  totalCitations: number;
  qualityScore: number;
  repairPassTriggered: boolean;
  
  // Model pool used
  modelPool: string[];
}

export function logResearchEval(record: ResearchEvalRecord): void {
  // Write to structured log file + emit telemetry histogram
  logger.info({ eval: record }, "[eval] research_request_complete");
  telemetry.histogram("research.quality_score", record.qualityScore);
  telemetry.histogram("research.citation_coverage", record.citationCoverage);
  telemetry.histogram("research.total_generation_ms", record.totalGenerationMs);
  telemetry.counter("research.repair_pass_triggered", record.repairPassTriggered ? 1 : 0);
  telemetry.histogram("research.total_sources", record.totalSourcesRetrieved);
  telemetry.histogram("research.tier1_sources", record.tier1Count);
  telemetry.histogram("research.snippet_only_pct", record.snippetOnlyPct);
}
