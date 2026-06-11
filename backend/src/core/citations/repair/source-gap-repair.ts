/**
 * Brick 20 — Source-gap repair.
 *
 * BUG-20-11 FIX: Proper source-gap disclosure repair that references
 * specific failed buckets from SourceGapReport instead of generic text.
 */

import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import type { SourceGapReport } from "../../evidence/source-gap-report.js";

const SOURCE_GAP_HEADER = "## Source Coverage Limitation";

/**
 * Repair text by adding/updating source-gap disclosure that references
 * specific failed and weak buckets from the SourceGapReport.
 */
export function repairSourceGapDisclosure(
  text: string,
  registry: EvidenceRegistryCore,
  sourceGapReport: SourceGapReport | null,
): { text: string; changed: boolean } {
  if (!sourceGapReport) {
    return { text, changed: false };
  }

  // Already has a source-gap section — skip
  if (text.includes(SOURCE_GAP_HEADER) || /##\s*Source\s+(Gap|Coverage)\s+Limitation/i.test(text)) {
    return { text, changed: false };
  }

  const failedBuckets = sourceGapReport.failedBuckets ?? [];
  const weakBuckets = sourceGapReport.weakBuckets ?? [];
  const available = sourceGapReport.availableCitationEligibleSources ?? registry.getCitationEligibleCount();
  const required = sourceGapReport.requiredUniqueSources ?? 0;

  const lines: string[] = [
    "",
    SOURCE_GAP_HEADER,
    "",
  ];

  if (failedBuckets.length > 0) {
    lines.push(
      `**Failed buckets** (zero usable sources): ${failedBuckets.join(", ")}. Claims in these areas cannot be supported by the available evidence and should not be treated as proven.`,
    );
  }

  if (weakBuckets.length > 0) {
    lines.push(
      `**Weak buckets** (limited sources): ${weakBuckets.join(", ")}. Claims from these buckets should be qualified with "based on limited available evidence" or converted into POIs.`,
    );
  }

  if (available < required) {
    lines.push(
      `Available citation-eligible sources: ${available}/${required} required. ${sourceGapReport.explanation ?? "Source coverage is below the research standard."}`,
    );
  } else if (sourceGapReport.explanation) {
    lines.push(sourceGapReport.explanation);
  }

  lines.push(
    "",
    "Claims in unsupported areas should be framed as committee questions, POIs, or disclosure demands rather than established facts.",
  );

  return {
    text: text.trimEnd() + "\n" + lines.join("\n"),
    changed: true,
  };
}
