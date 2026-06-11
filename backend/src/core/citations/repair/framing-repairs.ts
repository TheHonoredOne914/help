import type { CitationRepairContext, RepairIterationResult } from "./types.js";

/**
 * Split text into sentences for safer regex replacement.
 */
function splitIntoSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/g) ?? [text];
}

/**
 * Check if a match is inside a markdown citation block `[Source N](url)`.
 */
function isInsideCitation(text: string, matchIndex: number): boolean {
  const preceding = text.slice(0, matchIndex);
  const openBrackets = (preceding.match(/\[/g) || []).length;
  const closeBrackets = (preceding.match(/\]/g) || []).length;
  return openBrackets > closeBrackets;
}

/**
 * Brick 20: Electoral Caution Repair
 * BUG-20-10 FIX: sentence-aware replacement that preserves grammar.
 */
export function repairElectoralCaution(
  text: string,
  context: CitationRepairContext
): RepairIterationResult {
  let changed = false;
  
  const fraudRegex = /\b(?:EVMs?\s+(?:were|are)\s+hacked|massive\s+voter\s+fraud|election\s+was\s+stolen|rigged\s+elections?)\b/gi;
  
  const sentences = splitIntoSentences(text);
  const repairedSentences = sentences.map((sentence) => {
    if (!fraudRegex.test(sentence)) return sentence;
    
    return sentence.replace(fraudRegex, (match, offset) => {
      if (isInsideCitation(sentence, offset)) return match;
      changed = true;
      return `allegations of ${match.toLowerCase()} [requires ECI or judicial corroboration]`;
    });
  });

  return {
    text: repairedSentences.join(""),
    changed,
    issuesFixed: changed ? ["electoral_caution_repair"] : [],
    issuesRemaining: [],
    unsupportedClaimsActioned: changed ? 1 : 0
  };
}

/**
 * Brick 20: UN Framing Repair
 * BUG-20-06 FIX: skips replacements inside citation blocks.
 */
export function repairUnFraming(
  text: string,
  context: CitationRepairContext
): RepairIterationResult {
  let changed = false;

  const map: Record<string, string> = {
    "Member States": "Members of Parliament",
    "General Assembly": "Lok Sabha",
    "Security Council": "Cabinet Committee on Security",
    "international community": "Union Government",
    "resolution": "bill or motion",
    "treaty": "act or policy"
  };

  const sentences = splitIntoSentences(text);
  const repairedSentences = sentences.map((sentence) => {
    let repaired = sentence;
    for (const [unTerm, indTerm] of Object.entries(map)) {
      const regex = new RegExp(`\\b${unTerm}\\b`, "gi");
      if (regex.test(repaired)) {
        repaired = repaired.replace(regex, (match, offset) => {
          if (isInsideCitation(repaired, offset)) return match;
          changed = true;
          // Preserve capitalization logic could go here
          return indTerm;
        });
      }
    }
    return repaired;
  });

  return {
    text: repairedSentences.join(""),
    changed,
    issuesFixed: changed ? ["un_framing_repair"] : [],
    issuesRemaining: [],
    unsupportedClaimsActioned: 0
  };
}
