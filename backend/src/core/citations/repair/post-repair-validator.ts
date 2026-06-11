/**
 * Brick 20 — Post-repair validator.
 *
 * BUG-20-08/BUG-20-15 FIX: Re-runs all guards after repair iterations
 * to ensure repairs haven't introduced new issues.
 */

import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { ClaimGraph } from "../../evidence/claim-graph/types.js";
import { validateCitations, type CitationValidationReport } from "../../verification/citation-validator.js";
import { runHallucinationGuard, type HallucinationGuardReport } from "../../verification/hallucination-guard.js";
import { validateLegalClaims } from "../../verification/legal-claim-validator.js";
import { validateElectoralIntegrityLanguage } from "../../verification/electoral-integrity-guard.js";
import { validateIndianParliamentFraming } from "../../verification/indian-parliament-framing-guard.js";
import { detectUnsupportedClaims } from "../../evidence/claim-graph.js";
import type { UnsupportedClaimIssue } from "../../evidence/claim-graph/types.js";

export interface PostRepairValidationReport {
  passed: boolean;
  citationReport: CitationValidationReport;
  hallucinationReport: HallucinationGuardReport;
  legalReport: ReturnType<typeof validateLegalClaims>;
  electoralReport: ReturnType<typeof validateElectoralIntegrityLanguage>;
  framingReport: ReturnType<typeof validateIndianParliamentFraming>;
  unsupportedClaims: UnsupportedClaimIssue[];
  fatalIssues: string[];
  warnings: string[];
}

/**
 * Run all validation guards on post-repair text.
 * Returns a structured report so the orchestrator can decide whether
 * to continue, re-try, or abort.
 */
export function runPostRepairValidation(
  text: string,
  registry: EvidenceRegistryCore,
  contract: AgendaContract,
  claimGraph?: ClaimGraph,
): PostRepairValidationReport {
  const citationReport = validateCitations(text, registry, contract);
  const hallucinationReport = runHallucinationGuard(text, registry);
  const legalReport = validateLegalClaims(text, registry);
  const electoralReport = validateElectoralIntegrityLanguage(text);
  const framingReport = validateIndianParliamentFraming(text);
  const unsupportedClaims = claimGraph
    ? detectUnsupportedClaims(text, claimGraph, registry)
    : [];

  const fatalIssues: string[] = [];
  const warnings: string[] = [];

  if (!hallucinationReport.passed) {
    const hasFabrication = hallucinationReport.issues.some(
      (issue) => issue.type === "fabricated_source" || issue.type === "phantom_citation",
    );
    if (hasFabrication) {
      fatalIssues.push(`Hallucination guard: fabricated source or phantom citation detected`);
    } else {
      warnings.push(`Hallucination guard: ${hallucinationReport.issues.length} issue(s)`);
    }
  }

  if (!legalReport.passed) {
    if (legalReport.criticalIssues.length > 0) {
      fatalIssues.push(`Legal validation: unsupported critical legal claim`);
    } else {
      warnings.push(`Legal validation: ${legalReport.issues.length} issue(s)`);
    }
  }

  if (!electoralReport.passed) {
    warnings.push(`Electoral integrity: ${electoralReport.issues.length} issue(s)`);
  }

  if (!framingReport.passed) {
    warnings.push(`Indian parliament framing: ${framingReport.issues.length} issue(s)`);
  }

  const hardUnsupported = unsupportedClaims.filter(
    (claim) => claim.action === "hard_fail",
  );
  if (hardUnsupported.length > 0) {
    fatalIssues.push(`${hardUnsupported.length} hard-fail unsupported claim(s)`);
  }

  return {
    passed: fatalIssues.length === 0,
    citationReport,
    hallucinationReport,
    legalReport,
    electoralReport,
    framingReport,
    unsupportedClaims,
    fatalIssues,
    warnings,
  };
}
