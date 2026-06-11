import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { ClaimGraph } from "../../evidence/claim-graph/types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { EvidenceSource } from "../../evidence/evidence-registry-types.js";
import type { DivisionCitationPlan } from "./types.js";
import { getQualityFilteredSourceIds } from "./source-quality-filter.js";

/**
 * BUG-19-09 FIX: Division-specific citation selectors for D1-D11.
 *
 * Each division has different evidence needs:
 * - D1 (Core Brief): broad legal/institutional sources
 * - D2 (Analytical Dimensions): dimension-specific sources
 * - D3 (Stakeholders): government, court, civil society sources
 * - D4 (Conflict): sources showing opposing positions
 * - D5 (Narrative): media, government, watchdog sources
 * - D6 (Evidence Verification): strongest-evidence sources
 * - D7 (Debate Utility): Treasury Bench vs Opposition sources
 * - D8 (Policy Pathways): policy, government, legal sources
 * - D9 (Predictive): conditional/trend sources
 * - D10 (Resolution): legal, parliamentary sources
 * - D11 (Strategic): cross-cutting highest-confidence sources
 */

const DIVISION_BUCKET_PREFERENCES: Record<string, string[]> = {
  D1: ["constitutional", "legal", "government", "official"],
  D2: ["academic", "policy", "research", "index"],
  D3: ["government", "civil_society", "court", "electoral"],
  D4: ["watchdog", "rights", "opposition", "court"],
  D5: ["media", "press", "government", "watchdog"],
  D6: ["court", "official", "academic", "electoral"],
  D7: ["parliamentary", "government", "court", "legal", "watchdog", "rights"],
  D8: ["policy", "government", "legal", "parliamentary"],
  D9: ["academic", "research", "index", "trend"],
  D10: ["legal", "parliamentary", "constitutional", "court"],
  D11: ["court", "government", "academic", "watchdog", "policy", "legal"],
};

const DIVISION_SOURCE_CLASS_PREFERENCES: Record<string, string[]> = {
  D7: ["court_primary", "official_government", "parliamentary_records", "human_rights_watchdog"],
  D6: ["court_primary", "official_government", "academic_journal", "electoral_body"],
  D11: ["court_primary", "official_government", "academic_journal", "policy_research"],
};

export function selectCitationsForDivision(
  divisionKey: string,
  approvedSourceIds: number[],
  registry: EvidenceRegistryCore,
  claimLedger: ClaimLedger,
  claimGraph: ClaimGraph,
  count = 4,
): DivisionCitationPlan {
  const qualityIds = getQualityFilteredSourceIds(approvedSourceIds, registry);
  const divisionId = extractDivisionId(divisionKey);
  const bucketPrefs = DIVISION_BUCKET_PREFERENCES[divisionId] ?? [];
  const classPrefs = DIVISION_SOURCE_CLASS_PREFERENCES[divisionId] ?? [];
  const supportedSourceIds = claimSupportedSourceIds(claimLedger, claimGraph);

  const sources = qualityIds
    .filter((id) => supportedSourceIds.has(id))
    .map((id) => registry.getSource(id))
    .filter((s): s is EvidenceSource => Boolean(s));

  if (sources.length === 0) {
    return {
      divisionKey,
      selectedSourceIds: [],
      treasuryBenchIds: [],
      oppositionIds: [],
      strategy: "citation_gap",
    };
  }

  // Score each source by relevance to this division
  const scored = sources.map((source) => {
    let score = source.authorityScore;

    // Bucket preference boost
    for (const pref of bucketPrefs) {
      if (source.bucketIds.some((b) => b.includes(pref))) {
        score += 15;
        break;
      }
    }

    // Source class preference boost
    if (classPrefs.includes(source.sourceClass)) {
      score += 20;
    }

    // ClaimGraph claim support boost
    const claimSupport = claimGraph.claims.filter(
      (c) => c.supportingSourceIds.includes(source.id) && (c.supportScore ?? 0) >= 50,
    ).length;
    score += claimSupport * 5;

    // ClaimLedger credit-eligible boost
    const ledgerItems = claimLedger.items.filter(
      (item) => item.sourceId === source.id && item.citationCreditEligible,
    );
    score += ledgerItems.length * 3;

    return { source, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selectedSourceIds = scored.slice(0, count).map((s) => s.source.id);

  // For D7 (debate utility), split into Treasury Bench and Opposition
  let treasuryBenchIds: number[] = [];
  let oppositionIds: number[] = [];

  if (divisionId === "D7") {
    const half = Math.ceil(count / 2);
    // Treasury Bench: government, court, official sources
    const tbSources = scored.filter((s) =>
      ["court_primary", "official_government", "parliamentary_records", "electoral_body"].includes(s.source.sourceClass),
    );
    // Opposition: watchdog, rights, academic, media
    const oppSources = scored.filter((s) =>
      ["human_rights_watchdog", "digital_rights_watchdog", "press_freedom_index", "academic_journal", "civic_space_monitor"].includes(s.source.sourceClass),
    );
    treasuryBenchIds = tbSources.slice(0, half).map((s) => s.source.id);
    oppositionIds = oppSources.slice(0, half).map((s) => s.source.id);
  }

  return {
    divisionKey,
    selectedSourceIds,
    treasuryBenchIds,
    oppositionIds,
    strategy: selectedSourceIds.length > 0 ? "claim_graph" : "citation_gap",
  };
}

function claimSupportedSourceIds(claimLedger: ClaimLedger, claimGraph: ClaimGraph): Set<number> {
  const ids = new Set<number>();
  for (const item of claimLedger.items) {
    if (item.citationCreditEligible) ids.add(item.sourceId);
  }
  for (const claim of claimGraph.claims) {
    if (claim.validationStatus === "rejected") continue;
    if ((claim.supportScore ?? 0) < 50) continue;
    for (const sourceId of claim.supportingSourceIds) ids.add(sourceId);
  }
  return ids;
}

function extractDivisionId(key: string): string {
  const match = key.match(/D(\d+)/i);
  return match ? `D${match[1]}` : key;
}
