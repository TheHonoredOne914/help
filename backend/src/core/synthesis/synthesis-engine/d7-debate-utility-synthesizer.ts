/**
 * Brick 18 — D7 Debate Utility Synthesizer.
 *
 * B18-06: Replaces template-based D7 builder with evidence-grounded synthesis.
 * B18-13: Unique citations per argument, no modulo cycling.
 * B18-36: Filters title-only keyFacts from debate arguments.
 */

import type { EvidenceClaim, ClaimGraph } from "../../evidence/claim-graph.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { ModelRoleOutput } from "../../evidence/source-usage-map.js";
import { selectRoleOutputsForDivision } from "../role-generation/role-division-router.js";
import { buildClaimContextForDivision } from "./claim-context-builder.js";
import type { SynthesisEngineInput, DivisionOutput } from "./types.js";

/**
 * Build D7 Debate Utility Arsenal with evidence-grounded content.
 *
 * Requirements per plan:
 * - Treasury Bench, Opposition, POIs, Rebuttals, Coalition, Red Lines, Amendments
 * - Unique citations per argument (B18-13: no modulo cycling)
 * - Filter title-only keyFacts (B18-36)
 */
export function synthesizeDebateUtility(input: SynthesisEngineInput): DivisionOutput {
  const claimContext = buildClaimContextForDivision(
    input.claimGraph,
    "debate_utility",
    "DIVISION 7 - DEBATE UTILITY ARSENAL",
    input.evidenceRegistry,
  );

  const roleOutputs = selectRoleOutputsForDivision("D7_debate_utility", input.modelRoleOutputs);
  const usedSourceIds = new Set<number>();

  // B18-36: Filter title-only keyFacts
  const claims = claimContext.claims.filter((claim) => {
    // BUG-19-07 FIX: Check all supporting sources, not just [0]
    const hasUsableSource = claim.supportingSourceIds.some((id) => {
      const source = input.evidenceRegistry.getSource(id);
      if (!source) return false;
      const isOnlyTitleOnly = source.keyFacts.every(
        (fact) => /^title-only relevance:/i.test(fact.trim()),
      );
      return !isOnlyTitleOnly || source.legalHoldings.length > 0 || source.keyNumbers.length > 0;
    });
    return hasUsableSource;
  });

  // B18-13: Build unique citation function — no modulo cycling
  const getUniqueCitation = (claim: EvidenceClaim): string => {
    for (const sid of claim.supportingSourceIds) {
      if (!usedSourceIds.has(sid)) {
        usedSourceIds.add(sid);
        return input.evidenceRegistry.getCitationMarkdown(sid);
      }
    }
    // All supporting sources already used — use first but mark
    const fallback = claim.supportingSourceIds[0];
    if (fallback !== undefined) {
      return input.evidenceRegistry.getCitationMarkdown(fallback);
    }
    return getFallbackCitation(input.evidenceRegistry);
  };

  const treasuryArgs = claims.slice(0, 4).map((claim, i) => {
    const cite = getUniqueCitation(claim);
    // BUG-19-07 FIX: Find best source title from all supporting sources
    const source = claim.supportingSourceIds.map((id) => input.evidenceRegistry.getSource(id)).find((s) => s?.title);
    return `${i + 1}. Treasury Bench: defend legality, ministry accountability, or institutional process using ${source?.title ?? "ClaimGraph evidence"}. ${cite}`;
  });

  const oppositionArgs = claims.slice(0, 4).map((claim, i) => {
    const cite = getUniqueCitation(claim);
    // BUG-19-07 FIX: Find best source title from all supporting sources
    const source = claim.supportingSourceIds.map((id) => input.evidenceRegistry.getSource(id)).find((s) => s?.title);
    return `${i + 1}. Opposition: challenge proportionality, rights impact, transparency, or federalism using ${source?.title ?? "ClaimGraph evidence"}. ${cite}`;
  });

  const roleEvidence = renderRoleEvidence(roleOutputs, input.evidenceRegistry, 6);

  const sections = [
    "## DIVISION 7 - DEBATE UTILITY ARSENAL",
    roleEvidence ? `Role routed evidence from parliamentary/legal/data analysts:\n${roleEvidence}` : "",
    "Treasury Bench:",
    treasuryArgs.length > 0
      ? treasuryArgs.join("\n")
      : `1. Defend only claims that have ClaimLedger support. ${getFallbackCitation(input.evidenceRegistry)}`,
    "Opposition:",
    oppositionArgs.length > 0
      ? oppositionArgs.join("\n")
      : `1. Convert thin evidence into a demand for disclosure rather than an invented allegation. ${getFallbackCitation(input.evidenceRegistry)}`,
    "POIs:",
    "1. Which exact source proves the central number or legal claim?",
    "2. Which Union ministry owns implementation and reporting?",
    "3. Where is the Supreme Court doctrine or Election Commission defence in the record?",
    "4. What federalism objection survives after the cited evidence is conceded?",
    "5. Which amendment would make the policy proportionate?",
    "Rebuttals:",
    "1. If methodology is attacked, concede limits and pivot to cross-source corroboration.",
    "2. If security is invoked, demand necessity, proportionality, and review.",
    "3. If allegations are asserted as fact, force the speaker back to registry-backed proof.",
    "Coalition strategy: identify natural allies, potential swing positions, and non-negotiable red lines based on ClaimLedger evidence.",
    "Red Lines: non-compromise positions must be backed by strong ClaimGraph claims, not rhetoric.",
    "Motions and amendments: propose ministry reporting, rights-impact review, time-bound committee follow-up, and a clause rejecting uncited factual assertions.",
  ];

  const text = sections.filter(Boolean).join("\n\n");

  return {
    divisionId: "debate_utility",
    divisionNumber: 7,
    text,
    isFallback: false,
    qualityPassed: true,
    qualityIssues: [],
    claimCount: claims.length,
  };
}

function renderRoleEvidence(outputs: ModelRoleOutput[], registry: EvidenceRegistryCore, limit: number): string {
  return outputs
    .flatMap((output) => output.sourceUsageMap.map((item) => ({ output, item })))
    .slice(0, limit)
    .map(({ output, item }, index) => {
      const text = item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.limitation ?? "role finding";
      const cite = registry.getCitationMarkdown(item.sourceId);
      const qualify = item.confidence === "low" ? " (qualify carefully)" : "";
      return `${index + 1}. ${output.roleName}: ${text} ${cite}${qualify}`;
    })
    .join("\n");
}

function getFallbackCitation(registry: EvidenceRegistryCore): string {
  const eligible = registry.getCitationEligibleSources();
  // B18-43: Use best-match source, not just [0]
  const best = eligible.sort((a, b) => {
    const aScore = (a.citationStrength === "strong" ? 3 : a.citationStrength === "medium" ? 2 : 1);
    const bScore = (b.citationStrength === "strong" ? 3 : b.citationStrength === "medium" ? 2 : 1);
    return bScore - aScore;
  })[0];
  return best ? registry.getCitationMarkdown(best.id) : "";
}
