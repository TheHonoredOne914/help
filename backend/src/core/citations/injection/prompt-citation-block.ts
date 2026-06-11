import type { ClaimLedger } from "../../evidence/claim-ledger.js";
import type { ClaimGraph } from "../../evidence/claim-graph/types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import { buildClaimCitationMap } from "./claim-citation-mapper.js";
import { buildCounterclaimCitationMap, getCounterclaimCitationMarkdown } from "./counterclaim-citation-map.js";

type PromptBlockSource = {
  id: number;
  title: string;
  url: string;
  sourceClass?: string;
  bucketIds?: string[];
  keyFacts?: string[];
  citationStrength?: string;
  extractionQuality?: string;
};

/**
 * Builds the citation block for injection into the model prompt.
 * Includes:
 * - Claim-to-source mapping summary from ClaimLedger
 * - Counterclaim citation requirements
 * - Per-section citation hints
 */
export function buildPromptCitationBlock(
  sectionPlan: string[],
  approvedSourceIds: number[],
  registry: EvidenceRegistryCore,
  claimLedger: ClaimLedger,
  claimGraph: ClaimGraph,
): string {
  const lines: string[] = [];

  // Claim-source mapping summary
  const claimMap = buildClaimCitationMap(claimLedger, registry);
  if (claimMap.size > 0) {
    lines.push("CLAIM-SOURCE MAPPING:");
    for (const [section, ids] of claimMap.entries()) {
      const citations = ids.slice(0, 4).map((id) => registry.getCitationMarkdown(id)).filter(Boolean).join(" ");
      if (citations) {
        lines.push(`  ${section}: ${citations}`);
      }
    }
    lines.push("");
  }

  // Counterclaim citation requirements
  const counterclaimEntries = buildCounterclaimCitationMap(claimGraph, registry);
  const counterclaimsWithOwnSources = counterclaimEntries.filter((e) => e.counterclaimSourceIds.length > 0);
  if (counterclaimsWithOwnSources.length > 0) {
    lines.push("COUNTERCLAIM CITATIONS (must cite these, not the original claim source):");
    for (const entry of counterclaimsWithOwnSources.slice(0, 10)) {
      const citations = getCounterclaimCitationMarkdown(entry.counterclaimId, counterclaimEntries, registry);
      lines.push(`  ${entry.counterclaimText.slice(0, 80)}: ${citations}`);
    }
    lines.push("");
  }

  // Source availability per section
  const approvedSet = new Set(approvedSourceIds);
  const sectionHints = sectionPlan.slice(0, 12).map((section) => {
    const sectionLower = section.toLowerCase();
    const relevant = approvedSourceIds.filter((id) => {
      const source = registry.getSource(id);
      return source && source.bucketIds.some((b) => sectionLower.includes(b.replace(/_/g, " ")));
    });
    if (relevant.length > 0) {
      return `  ${section}: prefer ${relevant.slice(0, 3).map((id) => `[Source ${id}]`).join(", ")}`;
    }
    return null;
  }).filter(Boolean);

  if (sectionHints.length > 0) {
    lines.push("SECTION CITATION HINTS:");
    lines.push(...(sectionHints as string[]));
  }

  return lines.join("\n");
}

export function generatePromptCitationBlock(
  sources: PromptBlockSource[],
  _claimLedger?: ClaimLedger,
  _claimGraph?: ClaimGraph,
): string {
  return sources
    .filter((source) => Number.isFinite(source.id) && source.url)
    .map((source) => [
      `[Source ${source.id}] ${source.title}`,
      `URL: ${source.url}`,
      source.sourceClass ? `Class: ${source.sourceClass}` : null,
      source.bucketIds?.length ? `Buckets: ${source.bucketIds.join(", ")}` : null,
      source.citationStrength ? `CitationStrength: ${source.citationStrength}` : null,
      source.extractionQuality ? `ExtractionQuality: ${source.extractionQuality}` : null,
      source.keyFacts?.length ? `Facts: ${source.keyFacts.join("; ")}` : null,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}
