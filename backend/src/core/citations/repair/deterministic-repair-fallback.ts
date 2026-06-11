/**
 * Brick 20 — Deterministic repair fallback.
 *
 * BUG-20-12 FIX: Quality-filtered deterministic fallback that uses
 * citationStrength, ClaimLedger credit eligibility, and extraction
 * quality instead of any-source selection.
 */

import type { EvidenceRegistryCore, EvidenceSource } from "../../evidence/evidence-registry.js";
import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { AgendaContract } from "../../agenda/agenda-contract.js";

/**
 * Build a quality-filtered deterministic fallback answer when the
 * model/repair pipeline fails to produce adequately cited output.
 *
 * This replaces the old buildDeterministicCitedFallbackAnswer that
 * selected sources by authority only.
 */
export function buildQualityFilteredFallback(
  registry: EvidenceRegistryCore,
  contract: AgendaContract,
  claimLedger: ClaimLedger | undefined,
  sourceIds: number[],
  reason: string,
): string {
  // Select sources using quality criteria, not just authority
  const selected = selectQualitySources(registry, claimLedger, sourceIds);

  if (selected.length === 0) {
    return [
      "## Executive Thesis",
      `BestDel could not produce a cited research answer: ${reason}`,
      "No citation-eligible sources with adequate extraction quality were available.",
      "This agenda requires additional source retrieval before floor-safe research can be generated.",
    ].join("\n");
  }

  const evidenceLines = selected.map((source, index) => {
    const claim = firstEvidenceText([
      ...(source.keyFacts ?? []),
      ...(source.legalHoldings ?? []),
      ...(source.keyNumbers ?? []).map((v) => `Numeric evidence: ${v}`),
      source.snippet,
      source.fullText?.slice(0, 240),
    ]);
    const cite = registry.getCitationMarkdown(source.id);
    return `${index + 1}. ${source.title}: ${claim} ${cite}`;
  });

  return [
    "## Executive Thesis",
    `The evidence should be used cautiously in Indian Mock Parliament terms: Treasury Bench must defend legality, ministry accountability, public order, and institutional process, while Opposition should press rights-based challenge, proportionality, federalism, and source-backed floor strategy.`,
    "",
    "## Source-Grounded Evidence Ledger",
    evidenceLines.join("\n"),
    "",
    "## Indian Mock Parliament Debate Utility Arsenal",
    `Treasury Bench: anchor every defence in the cited ledger, concede limitations, and offer committee oversight. Opposition: convert each limitation into POIs, rebuttals, motions, amendments, and committee recommendations instead of uncited claims.`,
    "",
    "## Final Strategic Synthesis",
    `Diagnosis: the model output was not citation-complete (${reason}). Prescription: use this evidence ledger as the floor-safe answer. Warning: do not treat uncited model prose as validated research.`,
  ].join("\n");
}

/**
 * Select sources by quality criteria:
 * 1. ClaimLedger credit-eligible sources first
 * 2. Strong/medium citationStrength
 * 3. Full/partial extraction quality
 * 4. Authority score as tiebreaker
 */
function selectQualitySources(
  registry: EvidenceRegistryCore,
  claimLedger: ClaimLedger | undefined,
  sourceIds: number[],
  limit = 20,
): EvidenceSource[] {
  const creditEligibleIds = new Set(
    claimLedger?.items
      .filter((item) => item.citationCreditEligible)
      .map((item) => item.sourceId) ?? [],
  );

  const sources = sourceIds
    .map((id) => registry.getSource(id))
    .filter((s): s is EvidenceSource => s != null && s.citationEligible)
    .sort((a, b) => {
      // Credit-eligible sources first
      const aCredit = creditEligibleIds.has(a.id) ? 100 : 0;
      const bCredit = creditEligibleIds.has(b.id) ? 100 : 0;
      if (aCredit !== bCredit) return bCredit - aCredit;

      // Citation strength
      const strengthRank = (s: string) => s === "strong" ? 3 : s === "medium" ? 2 : 1;
      const aDelta = strengthRank(a.citationStrength);
      const bDelta = strengthRank(b.citationStrength);
      if (aDelta !== bDelta) return bDelta - aDelta;

      // Extraction quality
      const qualityRank = (q: string) => q === "full" ? 3 : q === "partial" ? 2 : 1;
      const aQ = qualityRank(a.extractionQuality);
      const bQ = qualityRank(b.extractionQuality);
      if (aQ !== bQ) return bQ - aQ;

      // Authority score tiebreaker
      return b.authorityScore - a.authorityScore;
    });

  return sources.slice(0, limit);
}

function firstEvidenceText(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = value?.replace(/\s+/g, " ").trim();
    if (text && text.length >= 8) return text.length > 260 ? `${text.slice(0, 257).trimEnd()}...` : text;
  }
  return "This source was selected as citation-eligible evidence but contains only a short extract; use it for limited support.";
}
