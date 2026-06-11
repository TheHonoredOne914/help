/**
 * Brick 20 — Contradiction repair.
 *
 * BUG-20-30 FIX: Checks ClaimGraph contradictions and counterclaims
 * in the output text and adds careful qualifying language where
 * contradictory sources are cited without acknowledgment.
 */

import type { ClaimGraph, ClaimContradiction } from "../../evidence/claim-graph/types.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";

const LINKED_SOURCE_PATTERN = /\[Source\s+(\d+)\]\([^)]+\)/gi;

/**
 * Scan the text for citation patterns that reference contradicted claims
 * and insert qualifying language if the contradiction is not acknowledged.
 */
export function repairContradictions(
  text: string,
  claimGraph: ClaimGraph,
  registry: EvidenceRegistryCore,
): { text: string; changed: boolean; contradictionsFound: number } {
  const contradictions = claimGraph.contradictions ?? [];
  if (contradictions.length === 0) {
    return { text, changed: false, contradictionsFound: 0 };
  }

  // Build a map of sourceId → contradictions involving that source
  const sourceContradictions = new Map<number, ClaimContradiction[]>();
  for (const contradiction of contradictions) {
    for (const sourceId of contradiction.sourceIds) {
      if (!sourceContradictions.has(sourceId)) {
        sourceContradictions.set(sourceId, []);
      }
      sourceContradictions.get(sourceId)!.push(contradiction);
    }
  }

  // Find all cited source IDs in the text
  const citedSourceIds = new Set<number>();
  for (const match of text.matchAll(LINKED_SOURCE_PATTERN)) {
    citedSourceIds.add(Number(match[1]));
  }

  // Check for contradicted sources that lack qualifying language
  let repaired = text;
  let contradictionsFound = 0;

  for (const [sourceId, relatedContradictions] of sourceContradictions) {
    if (!citedSourceIds.has(sourceId)) continue;

    for (const contradiction of relatedContradictions) {
      // Check if the contradiction is already acknowledged
      const acknowledgmentPatterns = [
        /\bcontradicts?\b/i,
        /\bconflicting\b/i,
        /\bdisputed\b/i,
        /\bhowever\b.*\bsource\b/i,
        /\bnote.*\bcontradiction\b/i,
        /\bcontesting\b/i,
      ];

      const sourcePattern = new RegExp(`\\[Source\\s+${sourceId}\\]\\([^)]+\\)`);
      const sourceMatch = repaired.match(sourcePattern);
      if (!sourceMatch) continue;

      // Find the sentence containing this citation
      const sourceIndex = repaired.indexOf(sourceMatch[0]);
      const sentenceStart = Math.max(0, repaired.lastIndexOf(".", sourceIndex - 1) + 1);
      const sentenceEnd = repaired.indexOf(".", sourceIndex) + 1 || repaired.length;
      const sentence = repaired.slice(sentenceStart, sentenceEnd);

      // If the sentence already acknowledges the contradiction, skip
      if (acknowledgmentPatterns.some((p) => p.test(sentence))) continue;

      // Check if other contradicting sources are mentioned nearby (within 200 chars)
      const nearbyText = repaired.slice(
        Math.max(0, sourceIndex - 200),
        Math.min(repaired.length, sourceIndex + 200),
      );
      const otherContradictedIds = contradiction.sourceIds.filter((id) => id !== sourceId);
      const otherSourceMentioned = otherContradictedIds.some(
        (id) => nearbyText.includes(`[Source ${id}]`),
      );

      if (otherSourceMentioned) {
        // Both sources cited nearby but no acknowledgment — add qualifier
        const qualifier = contradiction.severity === "high"
          ? ` (Note: this conflicts with other cited evidence — ${contradiction.description.slice(0, 100)}.)`
          : ` (Note: evidence here is contested — see contradicting sources.)`;

        repaired = repaired.slice(0, sentenceEnd) + qualifier + repaired.slice(sentenceEnd);
        contradictionsFound += 1;
      }
    }
  }

  return {
    text: repaired,
    changed: repaired !== text,
    contradictionsFound,
  };
}
