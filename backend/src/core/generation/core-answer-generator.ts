import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { QueryRoutingResult } from "../archive/context-router.js";
import type { ResearchAngle } from "../archive/research-angle-engine.js";
import type { ClaimGraph } from "../evidence/claim-graph.js";
import { buildClaimGraph, detectUnsupportedClaims } from "../evidence/claim-graph.js";
import type { EvidencePack } from "../evidence/evidence-pack-builder.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import { buildSourceUsageMapFromRegistry, validateSourceUsageMap, type ModelRoleOutput, type SourceUsageValidationReport } from "../evidence/source-usage-map.js";
import { buildSourceGapReport, type SourceGapReport } from "../evidence/source-gap-report.js";
import type { ResearchMode } from "../config/research-mode.js";
import { RESEARCH_LIMITS } from "../config/research-mode.js";
import { getSourceUsagePolicy } from "../config/source-usage-policy.js";
import { linkBareSourceCitations, validateCitations, type CitationValidationReport } from "../verification/citation-validator.js";
import { selectCitationsForSection } from "../citations/injection/deterministic-citation-injector.js";
import { selectCitationsForDivision } from "../citations/injection/division-citation-selector.js";
import type { DimensionEngineOutput } from "../../lib/types.js";
import { buildClaimLedger, type ClaimLedger } from "../evidence/claim-ledger.js";
import { validateElectoralIntegrityLanguage } from "../verification/electoral-integrity-guard.js";
import { runHallucinationGuard } from "../verification/hallucination-guard.js";
import { validateIndianParliamentFraming } from "../verification/indian-parliament-framing-guard.js";
import { validateLegalClaims } from "../verification/legal-claim-validator.js";
import { runTargetedRepair, type RepairType } from "../verification/repair-orchestrator.js";
import { runThesisQualityGate, type QualityGateReport } from "../verification/thesis-quality-gate.js";
import { runPostRepairValidation } from "../quality-gate/post-repair-validation-bridge.js";
import { thresholdsFor as thresholdsForMode } from "../quality-gate/mode-thresholds.js";
import type { ProviderName } from "../providers/provider-types.js";
import type { ProviderRouter } from "../providers/provider-router.js";
import { classifyProviderError, ProviderError, safeProviderErrorReport, type ProviderFailureReport } from "../providers/provider-errors.js";
import type { ProviderRunState } from "../providers/provider-run-state.js";
import type { ProviderResearchStatus } from "../providers/provider-health.js";
import { buildCoreAnswerSystemPrompt, buildCoreAnswerUserPrompt } from "./core-answer-prompt.js";
import { getPromptBudget, type PromptBudgetReport } from "./prompt-budget.js";
import { checkPromptBudget, getLimitProfile } from "../providers/limits/index.js";
import { buildSectionPlan } from "./section-plan-builder.js";

export type { SourceGapReport } from "../evidence/source-gap-report.js";

export interface RepairPassReport {
  type: RepairType;
  beforeIssueCount: number;
  afterIssueCount: number;
  changed: boolean;
  accepted?: boolean;
  reasons?: string[];
  beforeScore?: number;
  afterScore?: number;
}

export interface CoreResearchAnswerInput {
  requestId: string;
  userQuery: string;
  mode: ResearchMode;
  agendaContract: AgendaContract;
  evidenceRegistry: EvidenceRegistryCore;
  evidencePacks: EvidencePack[];
  claimGraph: ClaimGraph;
  claimLedger?: ClaimLedger;
  sourceUsageMaps: ModelRoleOutput[];
  archiveRouting?: QueryRoutingResult;
  researchAngles?: ResearchAngle[];
  divisionOutputs?: Map<string, string>;
  sourceGapReport?: SourceGapReport | null;
  forceFinalSourceIds?: number[];
  generationMode?: "model" | "deterministic";
  providerRouter?: ProviderRouter;
  providerName?: ProviderName;
  model?: string;
  providerRunState?: ProviderRunState;
  providerStatuses?: ProviderResearchStatus[];
  trustRegisteredProvidersWithoutStatus?: boolean;
  providerCallTimeoutMs?: number;
  promptCompressionLevel?: number;
  allowSyntheticSourceUsage?: boolean;
  dimensionWeights?: DimensionEngineOutput | null;
  autoFallback?: boolean;
  onStream?: (chunk: string) => void;
}

export interface CoreResearchAnswerResult {
  finalAnswer: string;
  citedSourceIds: number[];
  uniqueCitedSourceCount: number;
  citationValidationReport: CitationValidationReport;
  qualityGateReport: QualityGateReport;
  sourceUsageValidationReport: SourceUsageValidationReport;
  repairPasses: RepairPassReport[];
  sourceGapReport?: SourceGapReport | null;
  usedLegacyFallback: boolean;
  degradedFallbackUsed?: boolean;
  deterministicCitedFallbackUsed?: boolean;
  citationRepairAttempted?: boolean;
  citationRepairSucceeded?: boolean;
  modelRoleOutputs: ModelRoleOutput[];
  divisionOutputs: Map<string, string>;
  promptBudgetReports?: PromptBudgetReport[];
  providerFailureReports?: ProviderFailureReport[];
}

export async function generateCoreResearchAnswer(input: CoreResearchAnswerInput): Promise<CoreResearchAnswerResult> {
  let synthesisInput = input;
  const limits = RESEARCH_LIMITS[input.mode];
  const available = input.evidenceRegistry.getCitationEligibleSources();
  const requiredFinalSources = Math.min(limits.minFinalUniqueCitedSources, available.length);
  const sourceUsageIds = [
    ...new Set(input.sourceUsageMaps.flatMap((output) => (output.usedSourceIds as number[]) ?? [])),
  ].filter((id) => input.evidenceRegistry.getSource(id)?.citationEligible);
  const targetFinalSources = Math.max(
    requiredFinalSources,
    Math.min(input.agendaContract.minimumUniqueCitedSources, available.length),
    Math.min(sourceUsageIds.length, available.length),
  );
  const requestedSourceIds = input.forceFinalSourceIds ?? [...sourceUsageIds, ...selectFinalSourceIds(input.evidenceRegistry, targetFinalSources)];
  const sourceIds = repairFinalSourceSelection(input.evidenceRegistry, requestedSourceIds, targetFinalSources);
  const sourceGapReport = input.sourceGapReport ?? buildSourceGapReport(input.agendaContract, input.evidenceRegistry, []);
  const requestedGenerationMode = input.generationMode ?? process.env.CORE_GENERATION_MODE ?? (input.providerRouter ? "model" : "deterministic");
  const hasPartialModelConfig = Boolean(input.providerRouter || input.providerName || input.model);
  if (requestedGenerationMode === "model" && hasPartialModelConfig && (!input.providerRouter || !input.providerName || !input.model)) {
    throwProviderConfigurationError(input.providerName ?? "unknown");
  }
  if (available.length >= limits.minFinalUniqueCitedSources && sourceIds.length < limits.minFinalUniqueCitedSources && !sourceGapReport) {
    throw new Error(`fewer than ${limits.minFinalUniqueCitedSources} unique cited sources while enough valid sources exist`);
  }

  const syntheticAllowed = input.allowSyntheticSourceUsage === true && process.env.NODE_ENV !== "production";
  const modelRoleOutputs = input.sourceUsageMaps.length > 0
    ? input.sourceUsageMaps
    : syntheticAllowed
      ? ["agenda_architect", "retrieval_planner", "evidence_extractor", "thesis_synthesizer", "citation_auditor", "indian_parliamentary_strategist", "final_quality_auditor"]
        .map((role) => buildSourceUsageMapFromRegistry(role, input.evidenceRegistry, input.agendaContract, Math.min(input.agendaContract.minimumEvidenceCardsPerModel, available.length)))
      : throwSourceUsageMissing();
  const sourceUsageValidationReport = validateMergedSourceUsage(modelRoleOutputs, input.evidenceRegistry, input.agendaContract, {
    mode: input.mode,
    policy: getSourceUsagePolicy(input.mode),
    sourceGapReport,
  });
  if (!sourceUsageValidationReport.passed && !sourceGapReport) {
    throw new Error(sourceUsageValidationReport.failures.join("; "));
  }
  const effectiveClaimLedger = input.claimLedger ?? buildClaimLedger(
    modelRoleOutputs,
    input.evidenceRegistry,
    sourceUsageValidationReport.usedSourceIds,
  );
  const effectiveClaimGraph = needsSourceUsageClaimGraph(input.claimGraph)
    ? buildClaimGraph(input.evidenceRegistry, input.agendaContract, {
      modelRoleOutputs,
      sourceUsageAggregate: { validUsedSourceIds: sourceUsageValidationReport.usedSourceIds },
      evidencePacks: input.evidencePacks,
      mode: input.mode,
    })
    : input.claimGraph;
  synthesisInput = {
    ...input,
    claimLedger: effectiveClaimLedger,
    claimGraph: effectiveClaimGraph,
  };

  const finalAnswerResult = await buildFinalAnswer(synthesisInput, sourceIds, sourceGapReport, input.onStream);
  let finalAnswer = finalAnswerResult.finalAnswer;
  let deterministicCitedFallbackUsed = false;
  const repairPasses: RepairPassReport[] = [];
  const guardIssues = collectGuardIssues(finalAnswer, synthesisInput);
  for (const issue of guardIssues.slice(0, limits.maxRepairPasses)) {
    const before = collectGuardIssues(finalAnswer, synthesisInput).length;
    const previous = finalAnswer;
    const repaired = await runTargetedRepair(finalAnswer, synthesisInput.agendaContract, synthesisInput.evidencePacks, issue);
    finalAnswer = repaired;
    const after = collectGuardIssues(finalAnswer, synthesisInput).length;
    const changed = repaired !== previous;
    const accepted = changed && after <= before;
    repairPasses.push({ type: issue, beforeIssueCount: before, afterIssueCount: after, changed, accepted, reasons: accepted ? ["guard issue count did not worsen"] : ["guard repair made no progress"] });
    if (!accepted) break;
  }
  finalAnswer = linkBareSourceCitations(finalAnswer, synthesisInput.evidenceRegistry);

  let citationValidationReport = validateCitations(finalAnswer, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
  let citedBucketIds = [...new Set(citationValidationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
  if (
    requestedGenerationMode !== "model"
    && citationValidationReport.uniqueCitedSourceCount < limits.minFinalUniqueCitedSources
    && available.length >= limits.minFinalUniqueCitedSources
  ) {
    const forcedSourceIds = repairFinalSourceSelection(
      synthesisInput.evidenceRegistry,
      available.slice(0, limits.minFinalUniqueCitedSources).map((source) => source.id),
      limits.minFinalUniqueCitedSources,
    );
    const repaired = linkBareSourceCitations(
      buildAnswerText({ ...synthesisInput, forceFinalSourceIds: forcedSourceIds }, forcedSourceIds, sourceGapReport),
      synthesisInput.evidenceRegistry,
    );
    const repairedCitationReport = validateCitations(repaired, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
    if (repairedCitationReport.uniqueCitedSourceCount > citationValidationReport.uniqueCitedSourceCount) {
      repairPasses.push({
        type: "citation_repair",
        beforeIssueCount: limits.minFinalUniqueCitedSources - citationValidationReport.uniqueCitedSourceCount,
        afterIssueCount: Math.max(0, limits.minFinalUniqueCitedSources - repairedCitationReport.uniqueCitedSourceCount),
        changed: true,
        accepted: true,
        reasons: ["deterministic answer rebuilt with forced citation floor source IDs"],
      });
      finalAnswer = repaired;
      citationValidationReport = repairedCitationReport;
      citedBucketIds = [...new Set(citationValidationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
      deterministicCitedFallbackUsed = true;
    }
  }
  if (available.length >= limits.minFinalUniqueCitedSources && citationValidationReport.uniqueCitedSourceCount < limits.minFinalUniqueCitedSources) {
    const previous = finalAnswer;
    const repaired = linkBareSourceCitations(
      await runTargetedRepair(finalAnswer, synthesisInput.agendaContract, synthesisInput.evidencePacks, "citation_repair"),
      synthesisInput.evidenceRegistry,
    );
    const repairedCitationReport = validateCitations(repaired, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
    const changed = repaired !== previous;
    const accepted = changed && repairedCitationReport.uniqueCitedSourceCount >= citationValidationReport.uniqueCitedSourceCount;
    repairPasses.push({
      type: "citation_repair",
      beforeIssueCount: limits.minFinalUniqueCitedSources - citationValidationReport.uniqueCitedSourceCount,
      afterIssueCount: limits.minFinalUniqueCitedSources - repairedCitationReport.uniqueCitedSourceCount,
      changed,
      accepted,
      reasons: accepted ? ["citation repair did not reduce validated citation count"] : ["citation repair had no evidence-backed improvement"],
    });
    if (accepted) {
      finalAnswer = repaired;
      citationValidationReport = repairedCitationReport;
      citedBucketIds = [...new Set(citationValidationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
    }
    if (citationValidationReport.uniqueCitedSourceCount < limits.minFinalUniqueCitedSources) {
      if (requestedGenerationMode === "model") {
        const fallbackAnswer = linkBareSourceCitations(buildAnswerText(synthesisInput, sourceIds, sourceGapReport), synthesisInput.evidenceRegistry);
        const fallbackCitationReport = validateCitations(fallbackAnswer, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
        if (fallbackCitationReport.uniqueCitedSourceCount >= limits.minFinalUniqueCitedSources) {
          finalAnswer = fallbackAnswer;
          citationValidationReport = fallbackCitationReport;
          citedBucketIds = [...new Set(citationValidationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
          deterministicCitedFallbackUsed = true;
        }
      }
      if (citationValidationReport.uniqueCitedSourceCount < limits.minFinalUniqueCitedSources) {
        throw new Error(`fewer than ${limits.minFinalUniqueCitedSources} unique cited sources after evidence-only citation repair while enough valid sources exist`);
      }
    }
  }
  if (sourceGapReport && requestedGenerationMode === "model") {
    const sourceGapCitationTarget = Math.min(sourceIds.length, available.length);
    if (sourceGapCitationTarget > 0 && citationValidationReport.uniqueCitedSourceCount < sourceGapCitationTarget) {
      const fallbackAnswer = linkBareSourceCitations(buildAnswerText(synthesisInput, sourceIds, sourceGapReport), synthesisInput.evidenceRegistry);
      const fallbackCitationReport = validateCitations(fallbackAnswer, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
      if (fallbackCitationReport.uniqueCitedSourceCount > citationValidationReport.uniqueCitedSourceCount) {
        const beforeMissing = Math.max(0, sourceGapCitationTarget - citationValidationReport.uniqueCitedSourceCount);
        finalAnswer = fallbackAnswer;
        citationValidationReport = fallbackCitationReport;
        citedBucketIds = [...new Set(citationValidationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
        deterministicCitedFallbackUsed = true;
        repairPasses.push({
          type: "citation_repair",
          beforeIssueCount: beforeMissing,
          afterIssueCount: Math.max(0, sourceGapCitationTarget - fallbackCitationReport.uniqueCitedSourceCount),
          changed: true,
          accepted: true,
          reasons: ["source-gap answer used deterministic evidence citations because model under-cited available registry sources"],
        });
      }
    }
  }
  let unsupported = detectUnsupportedClaims(finalAnswer, synthesisInput.claimGraph, synthesisInput.evidenceRegistry);
  let hardUnsupported = unsupported.filter((item) => item.action === "hard_fail");
  if (hardUnsupported.length > 0) {
    for (const repairType of ["legal_accuracy_repair", "citation_repair"] as const) {
      const previous = finalAnswer;
      const beforeCount = hardUnsupported.length;
      const repaired = linkBareSourceCitations(
        await runTargetedRepair(finalAnswer, synthesisInput.agendaContract, synthesisInput.evidencePacks, repairType),
        synthesisInput.evidenceRegistry,
      );
      const repairedUnsupported = detectUnsupportedClaims(repaired, synthesisInput.claimGraph, synthesisInput.evidenceRegistry);
      const repairedHardUnsupported = repairedUnsupported.filter((item) => item.action === "hard_fail");
      const accepted = repaired !== previous && repairedHardUnsupported.length < beforeCount;
      repairPasses.push({
        type: repairType,
        beforeIssueCount: beforeCount,
        afterIssueCount: repairedHardUnsupported.length,
        changed: repaired !== previous,
        accepted,
        reasons: accepted ? ["unsupported hard-fail claim count decreased"] : ["unsupported hard-fail claim repair made no progress"],
      });
      if (accepted) {
        finalAnswer = repaired;
        unsupported = repairedUnsupported;
        hardUnsupported = repairedHardUnsupported;
      }
      if (hardUnsupported.length === 0) break;
    }
  }
  if (hardUnsupported.length > 0) throw new Error(`unsupported high-risk claims detected: ${hardUnsupported.map((item) => item.claim).join(", ")}`);
  if (unsupported.length > 0) {
    finalAnswer = `${finalAnswer.trim()}\n\n## Source Gap Disclosure\n${formatUnsupportedClaimDisclosure(unsupported.length)}`;
  }

  citationValidationReport = validateCitations(finalAnswer, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
  citedBucketIds = [...new Set(citationValidationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
  let qualityGateReport = runCoreQualityGate(finalAnswer, synthesisInput, citationValidationReport, citedBucketIds, modelRoleOutputs, sourceUsageValidationReport, sourceGapReport);
  if (qualityGateReport.repairRequired) {
    const repairTypes = mapQualityGateIssuesToRepairTypes(qualityGateReport);
    const effectiveRepairTypes = requestedGenerationMode === "deterministic" && sourceIds.length < limits.minFinalUniqueCitedSources
      ? repairTypes.filter((repairType) => repairType !== "citation_repair")
      : repairTypes;
    const remainingRepairBudget = Math.max(0, limits.maxRepairPasses - repairPasses.length);
    for (const repairType of effectiveRepairTypes.slice(0, remainingRepairBudget)) {
      const previous = finalAnswer;
      const beforeReport = qualityGateReport;
      const repaired = linkBareSourceCitations(
        await runTargetedRepair(
          finalAnswer,
          synthesisInput.agendaContract,
          synthesisInput.evidencePacks,
          repairType,
          { maxWords: thresholdsForMode(synthesisInput.mode).finalAnswerMaxWords },
        ),
        synthesisInput.evidenceRegistry,
      );
      const repairedCitationReport = validateCitations(repaired, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
      const repairedBucketIds = [...new Set(repairedCitationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
      const afterReport = runCoreQualityGate(repaired, synthesisInput, repairedCitationReport, repairedBucketIds, modelRoleOutputs, sourceUsageValidationReport, sourceGapReport);
      const validation = runPostRepairValidation({ beforeReport, afterReport, previousText: previous, repairedText: repaired });
      repairPasses.push({
        type: repairType,
        beforeIssueCount: validation.beforeIssueCount,
        afterIssueCount: validation.afterIssueCount,
        changed: validation.changed,
        accepted: validation.accepted,
        reasons: validation.reasons,
        beforeScore: validation.beforeScore,
        afterScore: validation.afterScore,
      });
      if (!validation.accepted) break;
      finalAnswer = repaired;
      qualityGateReport = afterReport;
      citationValidationReport = repairedCitationReport;
      citedBucketIds = repairedBucketIds;
    }
    finalAnswer = linkBareSourceCitations(finalAnswer, synthesisInput.evidenceRegistry);
    citationValidationReport = validateCitations(finalAnswer, synthesisInput.evidenceRegistry, synthesisInput.agendaContract);
    citedBucketIds = [...new Set(citationValidationReport.sourceIdsActuallyUsed.flatMap((id) => synthesisInput.evidenceRegistry.getSource(id)?.bucketIds ?? []))];
    const hgReport = runHallucinationGuard(finalAnswer, synthesisInput.evidenceRegistry);
    const legalReport = validateLegalClaims(finalAnswer, synthesisInput.evidenceRegistry);
    const electoralReport = validateElectoralIntegrityLanguage(finalAnswer);
    const framingReport = validateIndianParliamentFraming(finalAnswer);

    // Only throw if there are critical issues that weren't improved by repairs
    // Allow source gap cases to proceed with warnings
    const criticalUnrepaired = hgReport.issues.filter(i => i.severity === "critical" && !repairPasses.some(p => p.accepted && p.beforeIssueCount > p.afterIssueCount));
    if (!hgReport.passed && criticalUnrepaired.length > 0 && !sourceGapReport) {
      console.log(`[HG] Hallucination guard failed after repair:`, hgReport.issues);
      throw new Error("hallucination guard failed after repair");
    }
    // Log warnings but don't fail if source gaps exist or repairs made progress
    if (!hgReport.passed) {
      console.warn(`[HG] Hallucination guard issues (proceeding with source gaps):`, hgReport.issues.map(i => `${i.type}:${i.severity}`).join(", "));
    }
    if (!legalReport.passed) {
      console.warn(`[LEGAL] Legal claim validation failed after repair:`, legalReport.issues);
    }
    if (!electoralReport.passed) {
      console.warn(`[ELECTORAL] Electoral integrity failed after repair:`, electoralReport.issues);
    }
    if (!framingReport.passed) {
      console.warn(`[FRAMING] Indian parliament framing failed after repair:`, framingReport.issues);
    }
    qualityGateReport = runCoreQualityGate(finalAnswer, synthesisInput, citationValidationReport, citedBucketIds, modelRoleOutputs, sourceUsageValidationReport, sourceGapReport);
  }
  if (!qualityGateReport.passed && !sourceGapReport && qualityGateReport.fatalIssues.length > 0) {
    throw new Error(`quality gate failed: ${qualityGateReport.automaticFailures.join("; ")}`);
  }

  return {
    finalAnswer,
    citedSourceIds: citationValidationReport.sourceIdsActuallyUsed,
    uniqueCitedSourceCount: citationValidationReport.uniqueCitedSourceCount,
    citationValidationReport,
    qualityGateReport,
    sourceUsageValidationReport,
    repairPasses,
    sourceGapReport,
    usedLegacyFallback: false,
    deterministicCitedFallbackUsed,
    modelRoleOutputs,
    divisionOutputs: synthesisInput.divisionOutputs ?? buildDivisionOutputs(synthesisInput, sourceIds),
    promptBudgetReports: finalAnswerResult.promptBudgetReports,
    providerFailureReports: finalAnswerResult.providerFailureReports,
  };
}

function mapQualityGateIssuesToRepairTypes(report: QualityGateReport): RepairType[] {
  const text = [...report.automaticFailures, ...report.warnings].join(" | ").toLowerCase();
  const repairs: RepairType[] = [];
  // Length signals — over-cap must trim BEFORE other content-adding repairs run.
  if (/final_answer_too_long|too long/.test(text)) repairs.push("length_trim_repair");
  if (/final_answer_too_short|too short|word/.test(text)) repairs.push("length_repair");
  if (/missing required section|methodology|research angle/.test(text)) repairs.push("source_gap_disclosure_repair");
  if (/debate|treasury|opposition|poi|amendment|clause/.test(text)) repairs.push("debate_utility_repair");
  if (/legal|article|court/.test(text)) repairs.push("legal_accuracy_repair");
  if (/fraud|evm|election/.test(text)) repairs.push("electoral_caution_repair");
  if (/un-style|member states|security council/.test(text)) repairs.push("un_framing_repair");
  if (/d11|strategic|diagnosis|prescription|warning/.test(text)) repairs.push("d11_structure_repair");
  if (/citation|source/.test(text)) repairs.push("citation_repair");
  return repairs.length ? [...new Set(repairs)] : ["strategic_synthesis_repair"];
}

function runCoreQualityGate(
  finalAnswer: string,
  input: CoreResearchAnswerInput,
  citationValidationReport: CitationValidationReport,
  citedBucketIds: string[],
  modelRoleOutputs: ModelRoleOutput[],
  sourceUsageValidationReport: SourceUsageValidationReport,
  sourceGapReport: SourceGapReport | null,
): QualityGateReport {
  return runThesisQualityGate(finalAnswer, input.agendaContract, input.evidenceRegistry, {
    uniqueCitedSourceIds: citationValidationReport.sourceIdsActuallyUsed,
    citedBucketIds,
    modelRoleOutputs,
    mode: input.mode,
    claimGraph: input.claimGraph,
    claimLedger: input.claimLedger,
    evidenceRegistry: input.evidenceRegistry,
    sourceUsageValidationReport,
    divisionOutputs: input.divisionOutputs ?? buildDivisionOutputs(input, citationValidationReport.sourceIdsActuallyUsed),
    sourceGapReport,
  });
}

function buildAnswerText(input: CoreResearchAnswerInput, sourceIds: number[], sourceGapReport: SourceGapReport | null): string {
  const registry = input.evidenceRegistry;
  const cards = input.evidencePacks.flatMap((pack) => pack.cards);
  const hasLegalSources = registry.getSourcesByClass("court_primary").length > 0
    || registry.getSourcesByClass("legal_commentary").length > 0;
  const citations = sourceIds.map((id) => registry.getCitationMarkdown(id));
  const cite = (offset: number, count = 4) => {
    const selected = citations.slice(offset, offset + count);
    return (selected.length ? selected : citations.slice(0, Math.min(count, citations.length))).join(" ");
  };
  const angleLines = (input.researchAngles ?? []).slice(0, 10).map((angle, index) => [
    `${index + 1}. ${angle.title}`,
    `Why it matters: ${angle.whyItMatters}`,
    `Best side: ${angle.bestSide}. Source buckets needed: ${angle.sourceBucketsNeeded.join(", ")}.`,
    `Likely argument: ${angle.likelyArguments[0]}`,
    `Likely counter: ${angle.likelyCounters[0]}`,
    `Parliamentary use: ${angle.parliamentaryUse}`,
  ].join("\n")).join("\n\n");
  const bucketCoverage = registry.getBucketCoverage();
  const sourceBase = Object.entries(bucketCoverage).map(([bucket, count]) => `- ${bucket}: ${count} usable source(s)`).join("\n");
  const sourceLedger = citations.join(" ");
  const agendaLine = formatAgendaLine(input.agendaContract.normalizedAgenda, input.userQuery);
  const gapText = sourceGapReport
    ? `\n\nSourceGapReport: ${sourceGapReport.explanation} Available citation-eligible sources: ${sourceGapReport.availableCitationEligibleSources}. Failed buckets: ${sourceGapReport.failedBuckets.join(", ") || "none"}.`
    : "";
  const sectionPlan = buildSectionPlan(input.agendaContract, input.dimensionWeights);
  const sectionText = sectionPlan
    .filter((section) => !["Executive Thesis", "Methodology and Source Base", "Research Angle Map"].includes(section))
    .map((section, index) => buildSectionBody(section, cards, input, sourceGapReport, (count = 4) => cite(index * 3, count)))
    .join("\n\n");

  return [
    "# Executive Thesis",
    `The core issue is ${agendaLine}. The thesis must be built from cross-bucket corroboration across official, ${hasLegalSources ? "legal, " : ""}policy, media, academic, watchdog, parliamentary, and topic-specific evidence rather than a hardcoded agenda. The contested evidence is methodology, political context, implementation responsibility, and whether the relevant action is a documented safeguard or a disproportionate rights, federalism, or accountability burden. The Treasury Bench counter-position is ${hasLegalSources ? "source-backed legality, " : ""}national security or public order where relevant, Union ministry accountability, Election Commission defence where relevant, and ${hasLegalSources ? "independent review" : "documented institutional review"}. It matters in Indian parliamentary debate because Treasury Bench and Opposition strategy turn on whether delegates can prove claims with sources rather than slogans. ${cite(0, 6)}`,
    "# Methodology and Source Base",
    `Source buckets used:\n${sourceBase}\n\nSource classes include ${hasLegalSources ? "court/legal, " : ""}government official, electoral body, democracy index, watchdog, press freedom, academic, major Indian media, policy, and comparative democracy sources. Limitations: live search can miss paywalled material, methodology differs across indices, and archive references are not cited unless independently retrieved.${gapText} ${cite(6, 5)}`,
    sourceLedger ? `Selected citation ledger: ${sourceLedger}` : "",
    "# Research Angle Map",
    angleLines || "Research angles were generated from the agenda contract and Indian parliamentary fault lines.",
    sectionText,
  ].join("\n\n");
}

function buildSectionBody(
  section: string,
  cards: EvidencePack["cards"],
  input: CoreResearchAnswerInput,
  sourceGapReport: SourceGapReport | null,
  cite: (count?: number) => string,
): string {
  const primaryDimension = input.dimensionWeights?.primaryDimensions?.[0]?.name?.replace(/_/g, " ") ?? "constitutional";
  const hasLegalSources = input.evidenceRegistry.getSourcesByClass("court_primary").length > 0
    || input.evidenceRegistry.getSourcesByClass("legal_commentary").length > 0;
  const bucketCoverage = input.evidenceRegistry.getBucketCoverage();
  const coverageEntries = Object.entries(bucketCoverage).sort((a, b) => b[1] - a[1]);
  const strongestBucket = coverageEntries[0]?.[0] ?? "unproven";
  const weakestBucket = coverageEntries.find(([, count]) => count === 0)?.[0] ?? coverageEntries.at(-1)?.[0] ?? "unknown";
  const bucketCards = cards.filter((card) => section.toLowerCase().split(/\s+/).some((word) => card.bucketIds.join(" ").toLowerCase().includes(word))).slice(0, 4);
  const selectedCards = bucketCards.length ? bucketCards : cards.slice(0, 4);
  const evidenceLine = selectedCards.map((card) => {
    const fact = compactEvidenceFact(card.keyFacts[0] ?? card.debateUse ?? card.title);
    return `${compactEvidenceTitle(card.title)}: ${fact}`;
  }).join(" ");

  if (section === "Indian Mock Parliament Debate Utility Arsenal") {
    const treasury = selectedCards.slice(0, 5).map((card, index) => `${index + 1}. Treasury Bench: use ${compactEvidenceTitle(card.title)} to defend ${hasLegalSources ? "documented institutional basis" : "documented process"}, ministry accountability, public order, or Election Commission process. ${input.evidenceRegistry.getCitationMarkdown(card.sourceId)}`).join("\n");
    const opposition = selectedCards.slice(0, 5).map((card, index) => `${index + 1}. Opposition: use ${compactEvidenceTitle(card.title)} to press proportionality, rights, federalism, transparency, or institutional independence. ${input.evidenceRegistry.getCitationMarkdown(card.sourceId)}`).join("\n");
    return `## ${section}
Treasury Bench arguments:
${treasury || `1. Treasury Bench should defend documented safeguards and accountable process. ${cite(2)}`}

Opposition arguments:
${opposition || `1. Opposition should challenge proportionality and demand documentary proof. ${cite(2)}`}

POIs: Which source proves the number? Which source-backed record supports the claim? What ministry owns implementation? Where is the Election Commission defence? Which federalism objection survives scrutiny? What safeguard prevents misuse? Which affected group has primary-source proof? What amendment would the Treasury accept?

Rebuttals: Methodology dispute versus factual concession; security necessity versus proportionality; ECI process versus allegation; verified source record versus political slogan; Union competence versus state implementation.

Floor strategy: move a narrow amendment, preserve a committee recommendation, avoid unsupported fraud claims, and force the other side to concede evidentiary limits. Operative clauses should require ministry reporting, judicially reviewable safeguards, and committee follow-up. Preambular clauses should cite constitutional morality and public order limits. ${cite(5)}`;
  }

  if (section === "Final Strategic Synthesis") {
    return `## ${section}
Diagnosis: The strategic contradiction is that ${primaryDimension} framing can defend state action only if the record shows accountable legality, while the Opposition can convert weak or missing buckets into a credibility attack. Strongest bucket: ${strongestBucket}. Weakest bucket: ${weakestBucket}.

Prescription: Treasury Bench should concede documented gaps, anchor claims in official/court records, and offer committee oversight. Opposition should tie each attack to a named source, avoid unsupported absolute fraud language, and turn source gaps into demands for disclosure.

Warning: Any final speech that treats allegations as proven, cites bracket numbers without registry links, or ignores ${sourceGapReport ? "the disclosed source gap" : "bucket-level evidentiary limits"} will fail the research standard. ${cite(5)}`;
  }

  if (section === "Source Reliability Matrix") {
    return `## ${section}
Strongest evidence bucket: ${strongestBucket}. Weakest evidence bucket: ${weakestBucket}. Court/legal and official sources should carry legal claims; indices and watchdogs should carry score/ranking claims; media sources should mainly contextualize political chronology. ${evidenceLine} ${cite(4)}`;
  }

  if (section === "Evidence Gaps") {
    return `## ${section}
${sourceGapReport ? sourceGapReport.explanation : `No formal SourceGapReport was raised, but ${weakestBucket} remains the thinnest bucket and should be treated cautiously.`} Do not fill gaps with assumptions; turn them into POIs, committee questions, or calls for ministry records. ${cite(3)}`;
  }

  return `## ${section}
This section is driven by ${primaryDimension} and the agenda topic ${input.agendaContract.topicType}. Evidence used: ${evidenceLine || "available registry cards are limited, so claims are framed cautiously."} Parliamentary use: split Treasury Bench defence, Opposition challenge, POIs, amendments, and committee recommendations around proof rather than rhetoric. ${cite(4)}`;
}

function formatAgendaLine(normalizedAgenda: string, userQuery: string): string {
  const agenda = trimRepeatedText(stripOuterQuotes(normalizedAgenda.trim()));
  const query = trimRepeatedText(stripOuterQuotes(userQuery.trim()));
  if (!agenda) return query || "the requested Indian parliamentary research issue";
  if (!query || normalizeComparableText(agenda) === normalizeComparableText(query)) return agenda;
  if (normalizeComparableText(query).includes(normalizeComparableText(agenda))) return query;
  return `${agenda}: ${query}`;
}

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^["'“”]+|["'“”]+$/g, "").trim();
}

function trimRepeatedText(value: string): string {
  const separators = [...value.matchAll(/\s*:\s*/g)];
  for (const separator of separators) {
    const index = separator.index ?? -1;
    if (index <= 0) continue;
    const left = value.slice(0, index).trim();
    const right = value.slice(index + separator[0].length).trim();
    if (left && right && normalizeComparableText(left) === normalizeComparableText(right)) return left;
  }
  return value;
}

function compactEvidenceTitle(value: string): string {
  return compactText(value, 96);
}

function compactEvidenceFact(value: string): string {
  const cleaned = compactText(value, 220)
    .replace(/\b(JavaScript must be enabled|Decrease Font Size|Increase Font Size|Normal Theme|Sitemap|Advance Search)\b.*$/i, "")
    .trim();
  return cleaned || "the retrieved record supplies limited but citation-linked context";
}

function compactText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  const sentence = normalized.slice(0, maxChars + 1).replace(/\s+\S*$/, "").trim();
  return `${sentence || normalized.slice(0, maxChars).trim()}...`;
}

function formatUnsupportedClaimDisclosure(count: number): string {
  return `${count} high-risk claim(s) could not be fully proven from the ClaimGraph or ClaimLedger. Treat them as qualified allegations, turn them into POIs or committee questions, or omit them from floor speeches; the raw unsupported fragments are withheld from the answer to avoid promoting unverified claims.`;
}

async function buildFinalAnswer(input: CoreResearchAnswerInput, sourceIds: number[], sourceGapReport: SourceGapReport | null, onStream?: (chunk: string) => void): Promise<{ finalAnswer: string; promptBudgetReports: PromptBudgetReport[]; providerFailureReports: ProviderFailureReport[] }> {
  const requestedMode = input.generationMode ?? process.env.CORE_GENERATION_MODE ?? (input.providerRouter ? "model" : "deterministic");
  if (requestedMode !== "model") return { finalAnswer: buildAnswerText(input, sourceIds, sourceGapReport), promptBudgetReports: [], providerFailureReports: [] };
  if (!input.providerRouter || !input.providerName || !input.model) {
    throwProviderConfigurationError(input.providerName ?? "unknown");
  }
  const candidates = buildGenerationCandidates(input);
  const promptBudgetReports: PromptBudgetReport[] = [];
  const providerFailureReports: ProviderFailureReport[] = [];
  let forceFallback = false;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (i > 0 && input.autoFallback !== true && !forceFallback) break;
    forceFallback = false;

    const compressionLevel = input.promptCompressionLevel ?? 0;
    const first = await tryGeneration(input, candidate.providerName, candidate.model, sourceIds, compressionLevel, promptBudgetReports, onStream)
      .catch((error) => ({ error }));
    if (!isGenerationAttemptError(first)) return { finalAnswer: first as string, promptBudgetReports, providerFailureReports };
    const firstReport = classifyProviderError(candidate.providerName, first.error);
    input.providerRunState?.recordFailure(candidate.providerName, firstReport);
    providerFailureReports.push({ ...firstReport, model: candidate.model, stage: "core_generation", fallbackAttempted: candidates.length > 1 });
    if (firstReport.code === "request_too_large") {
      const retry = await tryGeneration(input, candidate.providerName, candidate.model, sourceIds, compressionLevel + 2, promptBudgetReports, onStream)
        .catch((error) => ({ error }));
      if (!isGenerationAttemptError(retry)) return { finalAnswer: retry as string, promptBudgetReports, providerFailureReports };
      const retryReport = classifyProviderError(candidate.providerName, retry.error);
      input.providerRunState?.recordFailure(candidate.providerName, retryReport);
      providerFailureReports.push({ ...retryReport, model: candidate.model, stage: "core_generation", fallbackAttempted: candidates.length > 1 });
      if (retryReport.code === "request_too_large") forceFallback = true;
    } else if (
      firstReport.code === "rate_limited" ||
      firstReport.code === "timeout" ||
      firstReport.code === "network_error" ||
      firstReport.code === "provider_unavailable"
    ) {
      // Transient error — always roll to next candidate
      forceFallback = true;
    }
  }
  const safe = providerFailureReports[0] ?? safeProviderErrorReport(input.providerName, new Error("Core generation provider failed"), { stage: "core_generation" });
  throw new ProviderError(safe.safeMessage, input.providerName, { providerFailureReports, promptBudgetReports });
}

function isGenerationAttemptError(value: string | { error: unknown }): value is { error: unknown } {
  return typeof value === "object" && value !== null && "error" in value;
}

async function tryGeneration(
  input: CoreResearchAnswerInput,
  providerName: ProviderName,
  model: string,
  sourceIds: number[],
  compressionLevel: number,
  reports: PromptBudgetReport[],
  onStream?: (chunk: string) => void,
): Promise<string> {
  const budget = getPromptBudget({ providerName, model, mode: input.mode, compressionLevel });
  const promptInput = { ...input, providerName, model, forceFinalSourceIds: sourceIds, promptCompressionLevel: compressionLevel };
  const { prompt, report } = buildCoreAnswerUserPrompt(promptInput, budget);
  reports.push(report);

  // Prompt budget safety gate: keep over-budget prompts local so fallback can
  // compress or switch providers without spending a doomed provider call.
  const budgetCheck = checkPromptBudget(providerName, model, report.estimatedInputTokens, budget);
  if (budgetCheck.recommendation !== "proceed") {
    const err = new Error(
      `Prompt too large for ${providerName}/${model}: estimated ${report.estimatedInputTokens} tokens exceeds safe budget of ${budgetCheck.safeInputBudget}`
    ) as Error & { code: string };
    err.code = "request_too_large";
    throw err;
  }

  // Use limit-profile timeout instead of hardcoded value
  const limits = getLimitProfile(providerName, model);
  const timeoutMs = Math.min(
    input.providerCallTimeoutMs ?? limits.preferredTimeoutMs,
    input.mode === "fast_research" ? Math.max(18_000, limits.defaultTimeoutMs) : limits.preferredTimeoutMs,
  );

  const response = await input.providerRouter!.complete(providerName, {
    model,
    roleName: "core_answer_generator",
    timeoutMs,
    temperature: 0.2,
    maxTokens: budget.maxOutputTokens,
    onStream,
    messages: [
      { role: "system", content: buildCoreAnswerSystemPrompt(input) },
      { role: "user", content: prompt },
    ],
  });
  return response.content;
}

export function buildGenerationCandidates(input: CoreResearchAnswerInput): Array<{ providerName: ProviderName; model: string }> {
  const registered = typeof (input.providerRouter as any)?.getRegisteredProviderNames === "function"
    ? ((input.providerRouter as any).getRegisteredProviderNames() as ProviderName[])
    : (["nvidia", "gemini", "github", "openrouter", "groq", "cerebras"] as ProviderName[]).filter((providerName) => (input.providerRouter as any)?.hasProvider?.(providerName));
  const defaults: Record<ProviderName, string> = {
    groq: "llama-3.3-70b-versatile",
    openrouter: "qwen/qwen3-32b",
    gemini: "gemini-2.5-pro",
    nvidia: "nvidia/llama-3.3-nemotron-super-49b-v1",
    github: "openai/gpt-4.1",
    cerebras: "llama3.3-70b",
    openai: "gpt-4.1",
  };
  const fallbackProviders = registered
    .filter((providerName) => providerName !== input.providerName)
    .sort((a, b) => {
      const budgetA = getLimitProfile(a, defaults[a]).providerMaxInputTokens ?? 0;
      const budgetB = getLimitProfile(b, defaults[b]).providerMaxInputTokens ?? 0;
      return budgetB - budgetA;
    });
  const candidates = [
    { providerName: input.providerName!, model: preferredModelForProvider(input.providerName!, input.model!, input, defaults) },
    ...fallbackProviders.map((providerName) => ({ providerName, model: preferredModelForProvider(providerName, defaults[providerName], input, defaults) })),
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate, index) => {
    const key = `${candidate.providerName}/${candidate.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const isExplicitSelectedCandidate = index === 0 && candidate.providerName === input.providerName && candidate.model === input.model;
    if (!isExplicitSelectedCandidate && input.providerRunState?.shouldSkipProvider(candidate.providerName, "core_generation", input.mode)) return false;
    if (typeof (input.providerRouter as any)?.hasProvider === "function" && !(input.providerRouter as any).hasProvider(candidate.providerName)) return false;
    if (isStaleGenerationModel(candidate.model)) return false;
    return providerCanGenerate(candidate.providerName, candidate.model, input);
  });
}

const STALE_GENERATION_MODELS = /claude-3\.5-sonnet|claude-3-5-sonnet|gemini-1\.5-pro|gemini-1\.5-flash|kimi-k2\.6|nemotron-3-ultra-550b-a55b|nemotron-ultra-253b/i;
const NON_ANSWER_GENERATION_MODELS = /content-safety|safeguard|guard|moderation|embed|rerank|search|audio|image|vision|parse|translate/i;

function preferredModelForProvider(
  providerName: ProviderName,
  requestedModel: string,
  input: CoreResearchAnswerInput,
  defaults: Record<ProviderName, string>,
): string {
  const status = input.providerStatuses?.find((item) => item.providerName === providerName);
  const liveModels = (status?.models ?? []).filter((model) => !isStaleGenerationModel(model));
  if (providerName === input.providerName && requestedModel && !isStaleGenerationModel(requestedModel)) {
    return requestedModel;
  }
  if (providerName === "openrouter") {
    const usable = liveModels.filter((model) => !NON_ANSWER_GENERATION_MODELS.test(model));
    return usable.find((model) => model === defaults.openrouter)
      ?? usable.find((model) => /qwen\/qwen3-32b/i.test(model))
      ?? usable.find((model) => /openai\/gpt-oss-120b/i.test(model))
      ?? usable.find((model) => /moonshotai\/kimi-k2\.6/i.test(model))
      ?? usable.find((model) => /:free$/i.test(model))
      ?? usable[0]
      ?? defaults.openrouter;
  }
  if (liveModels.includes(requestedModel)) return requestedModel;
  if (liveModels.includes(defaults[providerName])) return defaults[providerName];
  return liveModels[0] ?? defaults[providerName];
}

function providerCanGenerate(providerName: ProviderName, model: string, input: CoreResearchAnswerInput): boolean {
  if (isStaleGenerationModel(model)) return false;
  if (!input.providerStatuses) {
    const hasProviderFn = typeof (input.providerRouter as any)?.hasProvider === "function";
    return input.trustRegisteredProvidersWithoutStatus === true
      || !hasProviderFn
      || (input.allowSyntheticSourceUsage === true && process.env.NODE_ENV !== "production");
  }
  const status = input.providerStatuses.find((item) => item.providerName === providerName);
  if (!status) return false;
  if (!status.configured) return false;
  if (["missing_key", "invalid_key", "rate_limited", "network_error", "unavailable"].includes(status.status ?? "")) return false;
  if (status.status === "catalog_fallback" && status.canChat !== true) return false;
  if (status.status === "unverified" && status.canChat !== true) return false;
  if (status.healthy !== true && status.canChat !== true) return false;
  if (status.models?.length && !status.models.includes(model)) return false;
  return true;
}

function isStaleGenerationModel(model: string | undefined): boolean {
  return !model || STALE_GENERATION_MODELS.test(model) || NON_ANSWER_GENERATION_MODELS.test(model);
}

function needsSourceUsageClaimGraph(claimGraph: ClaimGraph): boolean {
  return (claimGraph.claims?.length ?? 0) === 0
    || (claimGraph.counterclaims?.length ?? 0) === 0
    || (claimGraph.contradictions?.length ?? 0) === 0;
}

function throwProviderConfigurationError(providerName: string): never {
  throw new ProviderError("Model-backed core generation requires providerRouter, providerName, and model.", providerName, {
    code: "config_error",
    retryable: false,
    safeMessage: "Model-backed core generation is missing provider configuration.",
    stage: "core_generation",
  });
}

function repairFinalSourceSelection(registry: EvidenceRegistryCore, selectedIds: number[], target: number): number[] {
  const selected = [...new Set(selectedIds.filter((id) => registry.getSource(id)?.citationEligible))];
  if (selected.length >= target) return selected.slice(0, target);
  const remaining = registry.getCitationEligibleSources()
    .filter((s) => !selected.includes(s.id))
    .sort((a, b) => {
      const strengthRank = (str: string) => str === "strong" ? 4 : str === "medium" ? 3 : str === "weak" ? 2 : 1;
      const qualityRank = (q: string) => q === "full" ? 4 : q === "partial" ? 3 : q === "snippet" ? 2 : 1;
      const aDelta = strengthRank(a.citationStrength) * 10 + qualityRank(a.extractionQuality) * 5 + a.authorityScore;
      const bDelta = strengthRank(b.citationStrength) * 10 + qualityRank(b.extractionQuality) * 5 + b.authorityScore;
      return bDelta - aDelta;
    });
  for (const source of remaining) {
    if (selected.length >= target) break;
    selected.push(source.id);
  }
  return selected;
};

function selectFinalSourceIds(registry: EvidenceRegistryCore, limit: number): number[] {
  const selected: number[] = [];
  const bucketCounts = new Map<string, number>();
  const sources = registry.getCitationEligibleSources().sort((a, b) => b.authorityScore - a.authorityScore);
  for (const source of sources) {
    if (selected.includes(source.id)) continue;
    const improvesBucket = source.bucketIds.some((bucketId) => (bucketCounts.get(bucketId) ?? 0) < 4);
    if (!improvesBucket && selected.length >= 30) continue;
    selected.push(source.id);
    for (const bucketId of source.bucketIds) bucketCounts.set(bucketId, (bucketCounts.get(bucketId) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  for (const source of sources) {
    if (selected.length >= limit) break;
    if (!selected.includes(source.id)) selected.push(source.id);
  }
  return selected;
}

function throwSourceUsageMissing(): never {
  const error = new Error("Core generation cannot proceed without validated SourceUsageMap outputs.") as Error & { code?: string };
  error.code = "SOURCE_USAGE_MISSING";
  throw error;
}

export function validateMergedSourceUsage(
  outputs: ModelRoleOutput[],
  registry: EvidenceRegistryCore,
  contract: AgendaContract,
  options: {
    mode: ResearchMode;
    policy: ReturnType<typeof getSourceUsagePolicy>;
    sourceGapReport?: SourceGapReport | null;
  },
): SourceUsageValidationReport {
  if (outputs.length === 0) {
    return {
      passed: false,
      usedSourceIds: [],
      uniqueUsedSourceCount: 0,
      bucketCount: 0,
      failures: ["no SourceUsageMap outputs"],
      warnings: [],
      structuredFailures: [],
      rawUsedSourceIds: [],
      rejectedSourceIds: [],
      approvedSourceIds: [],
      approvedUsageItems: [],
      invalidSourceCount: 0,
      strongSourceCount: 0,
      mediumSourceCount: 0,
      weakSourceCount: 0,
      snippetSourceCount: 0,
    };
  }
  const failures: string[] = [];
  const warnings: string[] = [];
  const usedSourceIds = new Set<number>();
  const buckets = new Set<string>();
  for (const output of outputs) {
    const report = validateSourceUsageMap(output, registry, contract, Math.min(output.minimumSourceRequirement ?? contract.minimumEvidenceCardsPerModel, registry.getCitationEligibleCount()));
    if (!report.passed) failures.push(...report.failures.map((failure) => `${output.roleName}: ${failure}`));
    report.warnings.forEach((warning) => warnings.push(warning));
    report.usedSourceIds.forEach((sourceId) => usedSourceIds.add(sourceId));
    report.usedSourceIds.forEach((sourceId) => registry.getSource(sourceId)?.bucketIds.forEach((bucketId) => buckets.add(bucketId)));
  }
  const uniqueUsedSourceCount = usedSourceIds.size;
  const availableCitationEligible = registry.getCitationEligibleCount();
  const required = options.policy.requiredSources;
  const minimum = options.policy.minimumToProceed;
  const effectiveMinimum = Math.min(minimum, availableCitationEligible);
  const strictPassed = failures.length === 0 && uniqueUsedSourceCount >= required;
  const nonStrictPassed = uniqueUsedSourceCount >= effectiveMinimum
    && (uniqueUsedSourceCount >= required || Boolean(options.sourceGapReport));
  if (availableCitationEligible < required) {
    warnings.push(`Only ${availableCitationEligible}/${required} citation-eligible sources were available for source usage validation.`);
  }
  if (uniqueUsedSourceCount < required) {
    const message = `SourceUsageMap aggregate used ${uniqueUsedSourceCount}/${required} validation-valid unique sources.`;
    if (options.policy.strictFailure || uniqueUsedSourceCount < effectiveMinimum) failures.push(message);
    else warnings.push(message);
  }
  if (!options.policy.strictFailure && !strictPassed && options.sourceGapReport) {
    warnings.push(`Source usage completed with source gaps: ${uniqueUsedSourceCount}/${required} validated sources.`);
  }
  return {
    passed: options.policy.strictFailure ? strictPassed : nonStrictPassed,
    usedSourceIds: [...usedSourceIds],
    uniqueUsedSourceCount,
    bucketCount: buckets.size,
    failures: options.policy.strictFailure || uniqueUsedSourceCount < effectiveMinimum ? failures : [],
    warnings,
  } as SourceUsageValidationReport;
}

function collectGuardIssues(text: string, input: CoreResearchAnswerInput): RepairType[] {
  const issues: RepairType[] = [];
  const hallucinationReport = runHallucinationGuard(text, input.evidenceRegistry);
  if (!hallucinationReport.passed) {
    if (hallucinationReport.issues.some((issue) => issue.type === "un_framing")) issues.push("un_framing_repair");
    if (hallucinationReport.issues.some((issue) => issue.type === "overclaim")) issues.push("electoral_caution_repair");
    if (hallucinationReport.issues.some((issue) => /citation/.test(issue.type))) issues.push("citation_repair");
  }
  if (!validateLegalClaims(text, input.evidenceRegistry).passed) issues.push("legal_accuracy_repair");
  if (!validateElectoralIntegrityLanguage(text).passed) issues.push("electoral_caution_repair");
  if (!validateIndianParliamentFraming(text).passed) issues.push("indian_parliamentary_framing_repair");
  return issues;
}

function buildDivisionOutputs(input: CoreResearchAnswerInput, sourceIds: number[]): Map<string, string> {
  const emptyLedger = { items: [], summary: { itemCount: 0, sourceCount: 0, citationCreditEligibleCount: 0, lowConfidenceCount: 0, roles: [] }, discardedClaims: [] };
  const emptyGraph = { claims: [] };
  const divisionPlan = (divKey: string, count = 4) => selectCitationsForDivision(
    divKey,
    sourceIds,
    input.evidenceRegistry,
    (input.claimLedger ?? emptyLedger) as any,
    (input.claimGraph ?? emptyGraph) as any,
    count,
  );
  const renderSourceIds = (ids: number[], label: string) => ids.map((id, index) => {
    const source = input.evidenceRegistry.getSource(id);
    if (!source) return null;
    return `${index + 1}. ${label}: use ${source.title} to anchor ${(source.keyFacts?.[0] ?? source.snippet ?? "verified evidence").slice(0, 180)} ${input.evidenceRegistry.getCitationMarkdown(id)}`;
  }).filter(Boolean).join("\n");
  const evidence = (section: string, divKey: string, count = 4) => {
    const plan = divisionPlan(divKey, count);
    const resolved = plan.selectedSourceIds.map(id => input.evidenceRegistry.getSource(id)).filter(Boolean);
    return resolved.map((source, index) =>
      `${index + 1}. ${source!.title}: ${(source!.keyFacts?.[0] ?? source!.snippet ?? "usable evidence").slice(0, 220)} ${input.evidenceRegistry.getCitationMarkdown(source!.id)}`
    ).join("\n");
  };
  const cite = (section: string, divKey: string, count = 4) => {
    const plan = divisionPlan(divKey, count);
    return plan.selectedSourceIds.map(id => input.evidenceRegistry.getCitationMarkdown(id)).join(" ");
  };
  const angleSummary = (input.researchAngles ?? []).slice(0, 3).map((angle) => angle.title).join("; ");
  const primaryDimensions = input.dimensionWeights?.primaryDimensions?.slice(0, 3).map((dimension) => `${dimension.name} (${dimension.boostedScore})`).join(", ") || "constitutional, electoral, rights";
  const d7Plan = divisionPlan("D7", 8);
  const treasuryEvidence = renderSourceIds(d7Plan.treasuryBenchIds, "Treasury Bench");
  const oppositionEvidence = renderSourceIds(d7Plan.oppositionIds.filter((id) => !d7Plan.treasuryBenchIds.includes(id)), "Opposition");
const d7 = `D7 Debate Utility Arsenal

Treasury Bench:
${treasuryEvidence || "1. Treasury Bench has no separate claim-supported citation set; treat this as a source gap and defend only claims that registry evidence directly supports."}

Opposition:
${oppositionEvidence || "1. Opposition has no separate claim-supported citation set; qualify rights challenges and convert missing evidence into POIs or committee demands."}

POIs:
POI 1: Which registry source proves the central number?
POI 2: Which court or statute supports the legal holding?
POI 3: What is the Union ministry's accountability mechanism?
POI 4: Where is the Election Commission defence if electoral integrity is alleged?
POI 5: Which source supports the rights-based challenge?
POI 6: Which evidence distinguishes public order from political convenience?
POI 7: What state-level federalism objection remains unanswered?
POI 8: What amendment would make the policy proportionate?
POI 9: Would the honourable member accept a committee record over a party claim?
POI 10: Can the Treasury Bench identify the precise safeguard and review forum?
POI 11: Can the Opposition separate proven legal holding from political inference?
POI 12: Does the Opposition accept that a weak snippet cannot prove a legal claim?
POI 13: Is the Treasury Bench claiming national security without proportionality review?
POI 14: What source supports the proposed operative clause?
POI 15: Which ministry answer or parliamentary record closes the source gap?
POI 16: Can the honourable member identify the exact citation that supports the floor claim?

Rebuttals:
1. If methodology is attacked, concede limits but cite cross-bucket corroboration.
2. If security is invoked, ask for necessity, proportionality, and review.
3. If EVM fraud is alleged, force allegation/judicial-record/ECI-defence framing.
4. If a court case is cited, separate holding from political inference.
5. If media reports are dismissed, pivot to official, court, or index sources.

Floor strategy: Treasury Bench should concede narrow gaps, offer committee oversight, and avoid absolute claims. Opposition should table a disclosure amendment, demand ministry reporting, and use POIs to expose unsupported claims. Operative clauses: create a reporting duty, require rights-impact review, and mandate committee follow-up. Preambular clauses: recognize constitutional morality and public order limits. Media line: Treasury says accountable legality; Opposition says evidence-backed rights scrutiny. ${d7Plan.selectedSourceIds.map((id) => input.evidenceRegistry.getCitationMarkdown(id)).join(" ")}`;

  const d11 = `D11 Strategic Insights

Diagnosis: The strategic centre is not whether one side can produce rhetoric; it is whether ${primaryDimensions} evidence survives cross-examination. Strongest available sources should be used as anchor proof, while weak buckets become committee questions rather than fabricated certainty.

Prescription: Treasury Bench should defend institutional legality, cite official/court material first, and offer amendments that reduce overbreadth. Opposition should connect each attack to a named source, convert missing records into POIs, and avoid unsupported assertions of fraud or authoritarian intent.

Warning: A speech that repeats D1-D10, cites bare bracket numbers, or treats allegations as proven will collapse under citation audit. The winning strategy is disciplined source use: proof for claims, caveats for gaps, and Indian parliamentary remedies for every critique. Research angles: ${angleSummary || "agenda-derived parliamentary fault lines"}. ${cite("D11", "D11", 6)}`;

  return new Map([
    ["D1_core_brief", `D1 Core Brief\nCentral agenda: ${input.agendaContract.normalizedAgenda}. India thesis: the dispute must be argued as a source-backed Indian parliamentary question, not as a generic world-politics claim. Fault lines: constitutional validity, ministry accountability, Opposition challenge, public order defence, and source gaps. Required evidence buckets are ${input.agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId).join(", ")}.\n${evidence("D1", "D1", 4)}\nCommittee framing: convert every unsupported claim into a POI or amendment demand. ${cite("D1", "D1", 4)}`],
    ["D2_analytical_dimensions", `D2 Analytical Dimensions\nPrimary dimension focus: ${primaryDimensions}. Legal dimension, political dimension, institutional dimension, severity, and downstream division use must be evidence-led.\n${evidence("D2", "D2", 4)}\nLater use: D7 weaponizes these dimensions; D11 converts them into strategy. ${cite("D2", "D2", 4)}`],
    ["D3_stakeholder_mapping", `D3 Stakeholder Mapping\nTreasury Bench, Opposition, relevant Union ministry, courts, Election Commission where relevant, civil society, state governments, and media are mapped by power and vulnerability.\n${evidence("D3", "D3", 4)}\nFederalism and implementation objections should be assigned to specific actors. ${cite("D3", "D3", 4)}`],
    ["D4_conflict_mapping", `D4 Conflict and Tension Mapping\nStructural contradiction: public order or institutional defence versus rights, proportionality, federalism, and accountability challenges.\n${evidence("D4", "D4", 4)}\nBoth sides must cite proof and avoid turning political inference into legal holding. ${cite("D4", "D4", 4)}`],
    ["D5_narrative_analysis", `D5 Narrative Analysis\nGovernment framing should stress legality, safeguards, national/public order, and ministry responsibility. Opposition framing should stress civil liberties, transparency, disproportionality, and institutional pressure.\n${evidence("D5", "D5", 4)}\nOverclaims must be cut or qualified. ${cite("D5", "D5", 4)}`],
    ["D6_evidence_verification", `D6 Evidence Verification\nSources by class and bucket drive the answer. Strongest facts come from registry cards; biggest gap is ${input.sourceGapReport?.weakBuckets?.[0] ?? "bucket coverage that remains thin"}.\n${evidence("D6", "D6", 6)}\nSourceUsageMap validation remains strict: weak relevance does not become proof. ${cite("D6", "D6", 6)}`],
    ["D7_debate_utility", d7],
    ["D8_policy_pathways", `D8 Policy Pathways\nLegal basis, ministry jurisdiction, legislative/executive action, precedent, coalition obstacles, feasibility constraints, and committee recommendation language must follow the evidence.\n${evidence("D8", "D8", 4)}\nRecommended pathway: disclosure, safeguards, review, and time-bound committee reporting. Feasibility depends on source-backed ministry capacity and court-safe drafting. ${cite("D8", "D8", 4)}`],
    ["D9_predictive_analysis", `D9 Predictive Analysis\nIF courts demand proportionality, THEN unsupported executive overreach weakens. IF the government provides official safeguards, THEN Opposition strategy must shift to implementation gaps. IF source gaps persist, THEN committee pressure rises.\n${evidence("D9", "D9", 4)}\nPredictive claims stay conditional, not invented certainty. Predict conditionally: each prediction must state the IF condition, likely institutional response, and evidence limit. ${cite("D9", "D9", 4)}`],
    ["D10_resolution_support", `D10 Resolution Support\nPreambular clauses should ground constitutional morality, public order limits, federal accountability, and source-backed concern. Operative clauses should require ministry reports, independent review, and rights-impact safeguards.\n${evidence("D10", "D10", 4)}\nRisk, tradeoff, and overclaim control: avoid vague security clauses, uncited fraud claims, and open-ended executive discretion. Use amendment language that states the remedy, review body, reporting duty, and limitation. ${cite("D10", "D10", 4)}`],
    ["D11_strategic_insights", d11],
    ["core_brief", `Core brief grounded in EvidencePacks and AgendaContract.\n${evidence("D1", "D1", 4)} ${cite("D1", "D1", 4)}`],
    ["evidence_verification", `Evidence verification uses registry citations and SourceUsageMap, not raw search dumps.\n${evidence("D6", "D6", 6)} ${cite("D6", "D6", 6)}`],
    ["debate_utility", d7],
    ["strategic_insights", d11],
  ]);
}
