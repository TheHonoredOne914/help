import type { CitationRepairContext, RepairIterationResult, UnsupportedClaimAction } from "./types.js";
import { findBestSupportingSource, determineUnsupportedClaimAction } from "./claim-source-matcher.js";
import { isSourceEligibleForCitation } from "./citation-credit-filter.js";
import { markdownCitationUrl } from "../../evidence/evidence-registry.js";

/**
 * Brick 20: Core Citation Repair.
 * BUG-20-02: repair injects `cards[0].citation` when all citations are stripped.
 * BUG-20-21: completely uncited text gets `cards[0]` appended unconditionally.
 */
export function repairCitations(
  text: string,
  context: CitationRepairContext
): RepairIterationResult {
  let changed = false;
  let currentText = text;
  const issuesFixed: import("./types.js").RepairType[] = [];
  const issuesRemaining: import("./types.js").RepairType[] = [];
  let unsupportedActioned = 0;

  // 1. Find invalid citations (e.g., [Source X](URL) or [Source X])
  const citationRegex = /\[Source\s+(\d+)\](?:\([^)]+\))?/g;
  let match;
  const citationsToReplace: { full: string; id: number; index: number; sentence: string }[] = [];

  while ((match = citationRegex.exec(currentText)) !== null) {
    const id = parseInt(match[1] ?? "0", 10);
    // Extract the sentence containing this citation
    const before = currentText.slice(0, match.index);
    const after = currentText.slice(match.index);
    const sentenceStart = Math.max(0, before.lastIndexOf(".") + 1);
    const sentenceEnd = after.indexOf(".") !== -1 ? match.index + after.indexOf(".") + 1 : currentText.length;
    const sentence = currentText.slice(sentenceStart, sentenceEnd).trim();

    citationsToReplace.push({ full: match[0], id, index: match.index, sentence });
  }

  // Iterate backwards to replace without messing up indices
  for (let i = citationsToReplace.length - 1; i >= 0; i--) {
    const citation = citationsToReplace[i];
    if (!citation) continue;
    const { full, id, index, sentence } = citation;
    
    // Check if the source is eligible
    if (!isSourceEligibleForCitation(id, context)) {
      // It's invalid. Try to find a better one based on the sentence text.
      const claimText = sentence.replace(/\[Source\s+\d+\](?:\([^)]+\))?/g, "").trim();
      const betterId = findBestSupportingSource(claimText, context);

      if (betterId !== null) {
        // We found a valid replacement!
        const betterSource = context.registry.getSource(betterId);
        currentText = currentText.substring(0, index) + `[Source ${betterId}](${betterSource?.url ? markdownCitationUrl(betterSource.url) : ""})` + currentText.substring(index + full.length);
        changed = true;
        if (!issuesFixed.includes("citation_repair")) issuesFixed.push("citation_repair");
      } else {
        // No valid source found. Strip citation then apply unsupported action
        // using position-based operations (not content-based search) to avoid
        // stale-index corruption when claimText appears in multiple sentences.
        const before = currentText.slice(0, index);
        const after = currentText.slice(index + full.length);
        const sentenceStart = Math.max(0, before.lastIndexOf(".") + 1);
        const afterDot = after.indexOf(".");
        const sentenceEnd = afterDot !== -1 ? index + full.length + afterDot + 1 : currentText.length;

        currentText = before + after;

        const action = determineUnsupportedClaimAction(claimText, context);
        if (action === "hard_fail") {
           issuesRemaining.push("citation_repair");
        } else {
           const updatedSentenceEnd = sentenceEnd - full.length;
           if (action === "remove") {
              currentText = currentText.slice(0, sentenceStart) + currentText.slice(updatedSentenceEnd);
           } else if (action === "qualify") {
              const sentenceText = currentText.slice(sentenceStart, updatedSentenceEnd);
              const qualified = sentenceText.replace(claimText, `${claimText} [needs further registry corroboration]`);
              currentText = currentText.slice(0, sentenceStart) + qualified + currentText.slice(updatedSentenceEnd);
           } else {
              currentText = currentText.slice(0, updatedSentenceEnd) + ` [Source gap: specific evidence for "${claimText}" is unavailable in current retrieval]` + currentText.slice(updatedSentenceEnd);
           }
           unsupportedActioned++;
        }
        changed = true;
      }
    } else {
      // It is eligible, but the URL might be missing or wrong.
      // E.g., [Source X] or [Source X](wrong-url)
      const expectedUrl = context.registry.getSource(id)?.url || "";
      const actualUrlMatch = full.match(/\((https?:\/\/[^)]+)\)/);
      const actualUrl = actualUrlMatch ? actualUrlMatch[1] : "";

      // Fix bare citations (missing URL) OR wrong URLs - as long as we have an expected URL
      if (actualUrl !== expectedUrl && expectedUrl) {
        currentText = currentText.substring(0, index) + `[Source ${id}](${markdownCitationUrl(expectedUrl)})` + currentText.substring(index + full.length);
        changed = true;
        if (!issuesFixed.includes("citation_repair")) issuesFixed.push("citation_repair");
      }
    }
  }

  // 2. We DO NOT append cards[0] unconditionally anymore. 
  // (Fixes BUG-20-02 and BUG-20-21)

  return {
    text: currentText,
    changed,
    issuesFixed,
    issuesRemaining,
    unsupportedClaimsActioned: unsupportedActioned,
  };
}
