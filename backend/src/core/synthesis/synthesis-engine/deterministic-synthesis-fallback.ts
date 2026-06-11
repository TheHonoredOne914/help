/**
 * Brick 18 — Deterministic synthesis fallback.
 *
 * B18-41: If all model candidates fail → deterministic fallback, not throw.
 * B18-47: Deterministic fallback uses ClaimLedger claims, not raw snippets/boilerplate.
 */

import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { AgendaContract } from "../../agenda/agenda-contract.js";

/**
 * Build a deterministic fallback synthesis using ClaimLedger claims
 * instead of raw snippets or boilerplate.
 *
 * B18-47: Uses ClaimLedger evidence, not template text.
 */
export function buildDeterministicSynthesisFallback(
  agendaContract: AgendaContract,
  registry: EvidenceRegistryCore,
  claimLedger: ClaimLedger,
): string {
  const eligible = claimLedger.items
    .filter((item) => item.citationCreditEligible && item.confidence !== "low")
    .sort((a, b) => {
      // B18-43: Best authority-score match from ClaimLedger-eligible sources
      const aScore = a.confidence === "high" ? 3 : a.confidence === "medium" ? 2 : 1;
      const bScore = b.confidence === "high" ? 3 : b.confidence === "medium" ? 2 : 1;
      return bScore - aScore;
    });

  if (eligible.length === 0) {
    return buildMinimalFallback(agendaContract, registry);
  }

  const sections: string[] = [
    `# Research Analysis: ${agendaContract.normalizedAgenda}`,
    "",
    `**Note:** This analysis was generated from ${eligible.length} ClaimLedger-verified evidence items as a deterministic fallback.`,
    "",
    "## Executive Summary",
    `This research addresses ${agendaContract.normalizedAgenda}. The following evidence-backed findings are drawn from ${claimLedger.summary.sourceCount} verified sources.`,
    "",
    "## Key Findings",
  ];

  // Group by role and render claims with citations
  const byRole = new Map<string, typeof eligible>();
  for (const item of eligible.slice(0, 20)) {
    const existing = byRole.get(item.roleName) ?? [];
    existing.push(item);
    byRole.set(item.roleName, existing);
  }

  for (const [roleName, items] of byRole) {
    sections.push(`\n### ${formatRoleName(roleName)}`);
    for (const item of items.slice(0, 5)) {
      const claimText = item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.evidenceSpan?.text ?? "Evidence finding";
      const cite = registry.getCitationMarkdown(item.sourceId);
      const qualify = item.confidence === "medium" ? " (moderate confidence)" : "";
      sections.push(`- ${claimText}${qualify} ${cite}`);
    }
  }

  // Limitations
  const discardedCount = claimLedger.discardedClaims.length;
  if (discardedCount > 0) {
    sections.push(
      "\n## Evidence Gaps and Limitations",
      `${discardedCount} claims were discarded during ClaimLedger verification. ` +
      `${claimLedger.summary.lowConfidenceCount} claims have low confidence and require corroboration.`,
    );
  }

  return sections.join("\n");
}

function buildMinimalFallback(
  agendaContract: AgendaContract,
  registry: EvidenceRegistryCore,
): string {
  const sources = registry.getCitationEligibleSources().slice(0, 5);
  const sourceList = sources.map((s) => `- ${registry.getCitationMarkdown(s.id)}: ${s.title}`).join("\n");

  return [
    `# Research Analysis: ${agendaContract.normalizedAgenda}`,
    "",
    "**Note:** Insufficient ClaimLedger-verified evidence for full synthesis. The following sources are available for manual analysis:",
    "",
    sourceList || "No citation-eligible sources available.",
    "",
    "This deterministic fallback was triggered because model-backed synthesis was unavailable and ClaimLedger verification yielded no eligible claims.",
  ].join("\n");
}

function formatRoleName(roleName: string): string {
  return roleName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
