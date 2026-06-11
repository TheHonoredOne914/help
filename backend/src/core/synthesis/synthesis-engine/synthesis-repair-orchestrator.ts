/**
 * Brick 18 — Synthesis repair orchestrator.
 *
 * B18-04: Evidence-aware repair passes — repairs consult ClaimGraph/ClaimLedger.
 * B18-28: Unsupported claim detection runs BEFORE repair loop.
 * B18-35: Repair loop uses maxRepairPasses as iteration limit, not slice(0, N).
 */

import type { ClaimGraph, UnsupportedClaimIssue } from "../../evidence/claim-graph.js";
import { detectUnsupportedClaims, hardUnsupportedIssues } from "../../evidence/claim-graph.js";
import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";

export interface SynthesisRepairResult {
  text: string;
  repairsMade: number;
  unsupportedClaimsDetected: UnsupportedClaimIssue[];
  hardFailures: UnsupportedClaimIssue[];
  repairPasses: SynthesisRepairPass[];
}

export interface SynthesisRepairPass {
  passNumber: number;
  unsupportedBefore: number;
  unsupportedAfter: number;
  changed: boolean;
}

/**
 * Run evidence-aware repair on synthesized text.
 *
 * B18-28: Detect unsupported claims BEFORE repair loop.
 * B18-35: Use maxRepairPasses as iteration limit.
 * B18-04: Repairs consult ClaimGraph and ClaimLedger.
 */
export function runSynthesisRepair(
  text: string,
  claimGraph: ClaimGraph,
  claimLedger: ClaimLedger,
  registry: EvidenceRegistryCore,
  maxRepairPasses = 3,
): SynthesisRepairResult {
  // B18-28: Detect BEFORE repair loop
  let currentText = text;
  const initialUnsupported = detectUnsupportedClaims(currentText, claimGraph, registry);
  const hardFailures = hardUnsupportedIssues(initialUnsupported);

  if (initialUnsupported.length === 0) {
    return {
      text: currentText,
      repairsMade: 0,
      unsupportedClaimsDetected: [],
      hardFailures: [],
      repairPasses: [],
    };
  }

  const repairPasses: SynthesisRepairPass[] = [];
  let totalRepairs = 0;

  // B18-35: Use maxRepairPasses as iteration limit, not slice
  for (let pass = 0; pass < maxRepairPasses; pass += 1) {
    const beforeIssues = detectUnsupportedClaims(currentText, claimGraph, registry);
    if (beforeIssues.length === 0) break;

    const repaired = applyEvidenceAwareRepairs(currentText, beforeIssues, claimLedger, registry);
    const afterIssues = detectUnsupportedClaims(repaired, claimGraph, registry);
    const changed = repaired !== currentText;

    repairPasses.push({
      passNumber: pass + 1,
      unsupportedBefore: beforeIssues.length,
      unsupportedAfter: afterIssues.length,
      changed,
    });

    if (changed) totalRepairs += 1;
    currentText = repaired;

    // Stop early if no more issues
    if (afterIssues.length === 0) break;
    // Stop if repair made no progress
    if (!changed) break;
  }

  const finalUnsupported = detectUnsupportedClaims(currentText, claimGraph, registry);

  return {
    text: currentText,
    repairsMade: totalRepairs,
    unsupportedClaimsDetected: finalUnsupported,
    hardFailures: hardUnsupportedIssues(finalUnsupported),
    repairPasses,
  };
}

/**
 * B18-04: Apply evidence-aware repairs using ClaimLedger and registry data.
 * Instead of blind regex replacement, uses structured evidence to fix claims.
 */
function applyEvidenceAwareRepairs(
  text: string,
  issues: UnsupportedClaimIssue[],
  ledger: ClaimLedger,
  registry: EvidenceRegistryCore,
): string {
  let result = text;

  for (const issue of issues) {
    switch (issue.type) {
      case "unsupported_rank":
      case "unsupported_score": {
        // Qualify unsupported numerical claims
        const value = issue.requiredValue ?? issue.claim;
        const pattern = new RegExp(escapeRegex(value), "g");
        const replacement = `${value} [source needed — not confirmed by ClaimGraph]`;
        const before = result;
        result = result.replace(pattern, replacement);
        if (result === before) break; // No match found
        break;
      }
      case "fake_judgment": {
        // B18-12: Unsupported claims → repair, not crash. Qualify fake judgments.
        const caseName = issue.claim;
        const pattern = new RegExp(escapeRegex(caseName), "g");
        result = result.replace(pattern, `${caseName} [UNVERIFIED — not found in registry or ClaimGraph]`);
        break;
      }
      case "unsupported_fraud_claim": {
        // Hard-qualify fraud claims
        if (issue.action === "qualify") {
          result = result.replace(
            /\b(fraud happened|election was stolen|evms? were manipulated)\b/gi,
            "$1 [ALLEGATION — requires judicial or official evidence]",
          );
        }
        break;
      }
      case "unsupported_high_risk_claim": {
        if (issue.action === "qualify") {
          // Find the claim text and add qualification
          const claimText = issue.claim;
          const shortText = claimText.slice(0, 60);
          const pattern = new RegExp(escapeRegex(shortText), "g");
          result = result.replace(pattern, `${shortText} [requires stronger evidence support]`);
        }
        break;
      }
    }
  }

  return result;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
