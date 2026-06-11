import type { CitationRepairContext, RepairIterationResult } from "./types.js";
import type { DivisionOutput, CanonicalDivisionId } from "../../synthesis/synthesis-engine/types.js";
import { repairCitations } from "./citation-repair.js";

/**
 * Brick 20: Division Citation Repair.
 * BUG-20-13: D1-D11 division outputs are not citation-repaired/validated.
 * BUG-20-24: D7/D11 repeat cite(0,N) and lack citation uniqueness enforcement.
 */
export function repairDivisionOutputs(
  context: CitationRepairContext
): { 
  changed: boolean; 
  repairedDivisions: Map<CanonicalDivisionId, DivisionOutput>;
  issuesFixed: import("./types.js").RepairType[];
} {
  const repairedDivisions = new Map<CanonicalDivisionId, DivisionOutput>();
  let overallChanged = false;
  const allIssuesFixed = new Set<import("./types.js").RepairType>();

  if (!context.divisionOutputs) {
    return { changed: false, repairedDivisions, issuesFixed: [] };
  }

  for (const [id, output] of context.divisionOutputs.entries()) {
    // 1. Repair citations for this specific division's text
    const repairResult = repairCitations(output.text, context);
    
    // 2. D7/D11 specific uniqueness check (BUG-20-24)
    let finalText = repairResult.text;
    if (id === "debate_utility" || id === "strategic_insights") {
       finalText = enforceCitationUniqueness(finalText);
       if (finalText !== repairResult.text) {
           repairResult.changed = true;
       }
    }

    if (repairResult.changed) {
      overallChanged = true;
      repairResult.issuesFixed.forEach(i => allIssuesFixed.add(i));
    }

    repairedDivisions.set(id, {
      ...output,
      text: finalText
    });
  }

  return {
    changed: overallChanged,
    repairedDivisions,
    issuesFixed: Array.from(allIssuesFixed)
  };
}

/**
 * Ensures citations within D7/D11 don't just repeat [Source 1] over and over.
 */
function enforceCitationUniqueness(text: string): string {
    // Split into paragraphs to enforce uniqueness per paragraph
    const paragraphs = text.split(/\n\n+/);
    
    const processedParagraphs = paragraphs.map((paragraph) => {
        const citationRegex = /\[Source\s+(\d+)\]/g;
        const seen = new Set<string>();
        let newParagraph = paragraph;

        // Iterate through all matches in this paragraph
        const matches = [...paragraph.matchAll(citationRegex)];
        
        // Reverse order replacement to not mess up indices
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            if (seen.has(match[0])) {
                // Duplicate in the same paragraph — strip it
                newParagraph = newParagraph.slice(0, match.index) + newParagraph.slice(match.index + match[0].length);
            } else {
                seen.add(match[0]);
            }
        }
        
        // Clean up double spaces left by stripping
        return newParagraph.replace(/\s{2,}/g, " ").trim();
    });

    return processedParagraphs.join("\n\n");
}
