import type { CitationRepairContext, CitationRepairResult, RepairType, RepairFailureReason } from "./types.js";
import { repairCitations } from "./citation-repair.js";
import { repairMissingBuckets, repairLegalAccuracy } from "./specialized-repairs.js";
import { repairElectoralCaution, repairUnFraming } from "./framing-repairs.js";
import { repairDivisionOutputs } from "./division-citation-repair.js";
import { runPostRepairValidation } from "./post-repair-validator.js";
import { RepairProgressTracker } from "./repair-progress-tracker.js";
import { repairContradictions } from "./contradiction-repair.js";

/**
 * Brick 20: Repair Progress Tracker & Orchestrator
 * BUG-20-05 FIX: uses RepairProgressTracker for loop safety and stale state detection.
 * BUG-20-19 FIX: re-runs guards using post-repair validator.
 * BUG-20-23 FIX: early exits on fatal unrepairable issues.
 */
export function runCitationRepairOrchestrator(
  initialText: string,
  context: CitationRepairContext,
  initialIssues: RepairType[],
  maxIterations = 3
): CitationRepairResult {
  let currentText = initialText;
  let changedTotal = false;
  let fallbackInjected = false;
  let sourceGapAdded = false;
  let removedClaims = 0;
  
  const allIssuesFixed = new Set<RepairType>();
  let currentIssues = [...initialIssues];
  const tracker = new RepairProgressTracker(maxIterations);
  
  // Repair D1-D11 divisions first (BUG-20-13)
  const divRepair = repairDivisionOutputs(context);
  let repairedDivisions = divRepair.repairedDivisions;

  while (tracker.shouldContinue() && currentIssues.length > 0) {
    const iterationStartText = currentText;
    const initialIssueCount = currentIssues.length;
    let iterationChanged = false;

    // 1. Core Citation Repair
    if (currentIssues.includes("citation_repair")) {
      const result = repairCitations(currentText, context);
      if (result.changed) {
        currentText = result.text;
        iterationChanged = true;
        result.issuesFixed.forEach(i => allIssuesFixed.add(i));
        removedClaims += result.unsupportedClaimsActioned;
        if (result.text.includes("[Source gap")) sourceGapAdded = true;
        
        currentIssues = currentIssues.filter(i => !result.issuesFixed.includes(i));
        result.issuesRemaining.forEach(i => {
           if (!currentIssues.includes(i)) currentIssues.push(i);
        });
      }
    }

    // 2. Specialized Repairs
    if (currentIssues.includes("missing_bucket_repair")) {
      const result = repairMissingBuckets(currentText, context);
      if (result.changed) {
        currentText = result.text;
        iterationChanged = true;
        result.issuesFixed.forEach(i => allIssuesFixed.add(i));
        currentIssues = currentIssues.filter(i => i !== "missing_bucket_repair");
      }
    }

    if (currentIssues.includes("legal_accuracy_repair")) {
      const result = repairLegalAccuracy(currentText, context);
      if (result.changed) {
        currentText = result.text;
        iterationChanged = true;
        result.issuesFixed.forEach(i => allIssuesFixed.add(i));
        currentIssues = currentIssues.filter(i => i !== "legal_accuracy_repair");
      }
    }

    if (currentIssues.includes("electoral_caution_repair")) {
      const result = repairElectoralCaution(currentText, context);
      if (result.changed) {
        currentText = result.text;
        iterationChanged = true;
        result.issuesFixed.forEach(i => allIssuesFixed.add(i));
        currentIssues = currentIssues.filter(i => i !== "electoral_caution_repair");
      }
    }

    if (currentIssues.includes("un_framing_repair") || currentIssues.includes("indian_parliamentary_framing_repair")) {
      const result = repairUnFraming(currentText, context);
      if (result.changed) {
        currentText = result.text;
        iterationChanged = true;
        result.issuesFixed.forEach(i => allIssuesFixed.add(i));
        currentIssues = currentIssues.filter(i => i !== "un_framing_repair" && i !== "indian_parliamentary_framing_repair");
      }
    }

    // 3. Contradiction Repair (BUG-20-30)
    if (context.claimGraph) {
      const result = repairContradictions(currentText, context.claimGraph, context.registry);
      if (result.changed) {
        currentText = result.text;
        iterationChanged = true;
      }
    }

    changedTotal = changedTotal || iterationChanged;
    
    // BUG-20-19 FIX: Re-run guards after repair iteration
    const report = runPostRepairValidation(currentText, context.registry, context.agendaContract, context.claimGraph);
    
    // BUG-20-23 FIX: Early exit on fatal issues
    if (report.fatalIssues.length > 0) {
       tracker.markFatal(report.fatalIssues[0]);
       break;
    }

    // Update issues based on new guard state
    const newIssues: RepairType[] = [];
    if (!report.citationReport.passed) newIssues.push("citation_repair");
    if (!report.legalReport.passed) newIssues.push("legal_accuracy_repair");
    if (!report.electoralReport.passed) newIssues.push("electoral_caution_repair");
    if (!report.framingReport.passed) newIssues.push("indian_parliamentary_framing_repair");
    
    currentIssues = newIssues;

    // Track progress
    const repairType = initialIssues[0]; // Simplification for tracking
    tracker.recordIteration({
      iteration: tracker.getSummary().totalIterations + 1,
      repairType,
      beforeIssueCount: initialIssueCount,
      afterIssueCount: currentIssues.length,
      changed: iterationChanged,
      durationMs: 0
    });
  }

  const trackerSummary = tracker.getSummary();
  let failureReason: RepairFailureReason | undefined = trackerSummary.fatalIssue ? "no_progress" : undefined;
  if (trackerSummary.staleCount >= 2) failureReason = "no_progress";
  if (trackerSummary.totalIterations >= maxIterations && currentIssues.length > 0) failureReason = "max_iterations_reached";

  // BUG-20-17: fallback injected detection
  if (!/\[Source\s+\d+\]/.test(currentText) && sourceGapAdded) {
     fallbackInjected = true;
  }

  return {
    text: currentText,
    changed: changedTotal || divRepair.changed,
    issueTypesFixed: Array.from(allIssuesFixed),
    fallbackInjected,
    sourceGapAdded,
    removedClaims,
    remainingIssues: currentIssues,
    failureReason,
    iterationCount: trackerSummary.totalIterations,
    repairedDivisions
  };
}
