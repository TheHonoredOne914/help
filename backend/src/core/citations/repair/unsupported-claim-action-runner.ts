import type { CitationRepairContext, UnsupportedClaimAction } from "./types.js";

/**
 * Brick 20: Unsupported Claim Action Runner.
 * Executes the designated action for an unsupported claim.
 */
export function executeUnsupportedClaimAction(
  text: string,
  claimText: string,
  action: UnsupportedClaimAction,
  context: CitationRepairContext
): string {
  // Escape regex specials from the claim text to find it in the full text
  const escapedClaim = claimText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`([^.]*?${escapedClaim}[^.]*\\.)`, "i");

  const match = text.match(regex);
  if (!match) return text;

  const sentence = match[1] ?? "";

  switch (action) {
    case "remove":
      return text.replace(sentence, "");
    
    case "qualify": {
      // Add qualification without losing the surrounding context
      const qualified = sentence.replace(claimText, `${claimText} [needs further registry corroboration]`);
      return text.replace(sentence, qualified);
    }
    
    case "source_gap": {
      // Add a source gap note
      const gapNote = `[Source gap: specific evidence for "${claimText}" is unavailable in current retrieval]`;
      return text.replace(sentence, `${sentence} ${gapNote}`);
    }

    case "hard_fail":
      // We don't modify the text here; the caller must handle the hard failure
      return text;
  }
}
