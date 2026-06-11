/**
 * Brick 20 — Source number freezer.
 *
 * BUG-20-18 FIX: Freezes source numbering/URL mapping at synthesis time
 * and validates during repair to prevent source ID drift between
 * synthesis and repair phases.
 */

import { markdownCitationUrl, type EvidenceRegistryCore } from "../../evidence/evidence-registry.js";

export interface FrozenSourceMap {
  entries: Map<number, { url: string; title: string }>;
  frozenAt: number;
}

/**
 * Freeze the current source numbering from the registry.
 * This snapshot is used to validate that repair operations
 * don't reference stale or changed source IDs.
 */
export function freezeSourceNumbers(registry: EvidenceRegistryCore): FrozenSourceMap {
  const entries = new Map<number, { url: string; title: string }>();
  for (const source of registry.getCitationEligibleSources()) {
    entries.set(source.id, { url: source.url, title: source.title });
  }
  return { entries, frozenAt: Date.now() };
}

/**
 * Validate that text only references source IDs that existed
 * in the frozen map with matching URLs.
 */
export function validateFrozenSourceNumbers(
  text: string,
  frozen: FrozenSourceMap,
): { valid: boolean; driftedIds: number[]; phantomIds: number[] } {
  const LINKED_PATTERN = /\[Source\s+(\d+)\]\(([^)]+)\)/gi;
  const driftedIds: number[] = [];
  const phantomIds: number[] = [];

  for (const match of text.matchAll(LINKED_PATTERN)) {
    const id = Number(match[1]);
    const url = match[2];
    const frozen_entry = frozen.entries.get(id);

    if (!frozen_entry) {
      phantomIds.push(id);
    } else if (frozen_entry.url !== url) {
      driftedIds.push(id);
    }
  }

  return {
    valid: driftedIds.length === 0 && phantomIds.length === 0,
    driftedIds: [...new Set(driftedIds)],
    phantomIds: [...new Set(phantomIds)],
  };
}

/**
 * Repair drifted or phantom source references using the frozen map.
 * - Drifted IDs: replace URL with frozen URL.
 * - Phantom IDs: remove the citation entirely.
 */
export function repairSourceNumberDrift(
  text: string,
  frozen: FrozenSourceMap,
): { text: string; changed: boolean; repairedCount: number } {
  let repairedCount = 0;
  const repaired = text.replace(
    /\[Source\s+(\d+)\]\(([^)]+)\)/gi,
    (match, idStr, url) => {
      const id = Number(idStr);
      const entry = frozen.entries.get(id);

      if (!entry) {
        // Phantom ID: remove the citation
        repairedCount += 1;
        return "";
      }

      if (entry.url !== url) {
        // Drifted URL: replace with frozen URL
        repairedCount += 1;
        return `[Source ${id}](${markdownCitationUrl(entry.url)})`;
      }

      return match;
    },
  );

  return {
    text: repaired.replace(/\s{2,}/g, " ").trim(),
    changed: repairedCount > 0,
    repairedCount,
  };
}
