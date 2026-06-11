import { markdownCitationUrl, type EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { CitationIdMapping } from "./types.js";

/**
 * Resolves citation IDs after source merges or renumbering.
 * When two sources are merged (e.g., via source-merge-citation-fix),
 * old IDs in generated text need to be remapped to the surviving ID.
 */
export function resolveCitationIds(
  text: string,
  mappings: CitationIdMapping[],
  registry: EvidenceRegistryCore,
): string {
  if (mappings.length === 0) return text;

  let resolved = text;
  for (const mapping of mappings) {
    const source = registry.getSource(mapping.newId);
    if (!source) continue;

    // Replace [Source oldId](oldUrl) with [Source newId](newUrl)
    const oldPattern = new RegExp(
      `\\[Source\\s+${mapping.oldId}\\]\\([^)]+\\)`,
      "gi",
    );
    const newCitation = `[Source ${mapping.newId}](${markdownCitationUrl(source.url)})`;
    resolved = resolved.replace(oldPattern, newCitation);

    // Replace bare [Source oldId] references
    const barePattern = new RegExp(
      `\\[Source\\s+${mapping.oldId}\\](?!\\()`,
      "gi",
    );
    resolved = resolved.replace(barePattern, `[Source ${mapping.newId}]`);
  }

  return resolved;
}

/**
 * Builds a mapping table from old IDs to new IDs based on the current
 * registry state, detecting which sources were merged away.
 */
export function detectMergedSourceMappings(
  originalSourceIds: number[],
  registry: EvidenceRegistryCore,
): CitationIdMapping[] {
  const mappings: CitationIdMapping[] = [];

  for (const oldId of originalSourceIds) {
    const source = registry.getSource(oldId);
    if (source) continue; // Still exists, no mapping needed

    // Source was merged — try to find by URL in remaining sources
    // This is a best-effort heuristic; the merge function should
    // ideally record the mapping directly.
    // For now, we skip auto-detection since source-merge-citation-fix
    // replaces in-place and doesn't create new IDs.
  }

  return mappings;
}
