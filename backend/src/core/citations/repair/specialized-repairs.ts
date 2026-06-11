import type { CitationRepairContext, RepairIterationResult } from "./types.js";
import { repairSourceGapDisclosure } from "./source-gap-repair.js";

/**
 * Brick 20: Missing Bucket Repair
 * BUG-20-11 FIX: delegates to source-gap-repair which references specific buckets.
 */
export function repairMissingBuckets(
  text: string,
  context: CitationRepairContext
): RepairIterationResult {
  const result = repairSourceGapDisclosure(text, context.registry, context.sourceGapReport ?? null);

  return {
    text: result.text,
    changed: result.changed,
    issuesFixed: result.changed ? ["missing_bucket_repair"] : [],
    issuesRemaining: [],
    unsupportedClaimsActioned: 0
  };
}

/**
 * Brick 20: Legal Accuracy Repair
 * BUG-20-29 FIX: checks ClaimLedger for legal claims before applying qualifiers.
 */
export function repairLegalAccuracy(
   text: string,
   context: CitationRepairContext
): RepairIterationResult {
  let changed = false;
  let currentText = text;
  const issuesFixed: import("./types.js").RepairType[] = [];

  // Look for assertions of court rulings or legal holdings
  const regex = /(Supreme Court|High Court|Constitution Bench|Election Commission).*?(ruled|held|directed|mandated|struck down)[^\]]*?(?!\s*\[Source)/gi;
  
  // Check if we have strong legal claims in the ledger
  const hasLegalClaims = context.claimLedger?.items.some(
    item => item.roleName === "legal" || !!item.legalHolding
  ) ?? false;
  
  currentText = currentText.replace(regex, (match) => {
      // If we already have a citation block right after, skip it
      if (text.slice(text.indexOf(match) + match.length).trim().startsWith("[Source")) {
          return match;
      }
      
      changed = true;
      if (!issuesFixed.includes("legal_accuracy_repair")) issuesFixed.push("legal_accuracy_repair");
      
      return hasLegalClaims
        ? `${match} [needs specific registry citation]`
        : `${match} [requires independent legal corroboration — no primary holding available]`;
  });

  return {
     text: currentText,
     changed,
     issuesFixed,
     issuesRemaining: [],
     unsupportedClaimsActioned: changed ? 1 : 0
  };
}
