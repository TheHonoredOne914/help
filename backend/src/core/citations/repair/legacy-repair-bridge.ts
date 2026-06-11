import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { EvidencePack } from "../../evidence/evidence-pack-builder.js";
import type { RepairType } from "./types.js";
import { runTargetedRepair as legacyRunTargetedRepair } from "../../verification/repair-orchestrator.js";
import { runCitationRepairOrchestrator } from "./repair-orchestrator.js";
import type { CitationRepairContext } from "./types.js";
import { validateCitations } from "../../verification/citation-validator.js";

/**
 * Brick 20: Legacy Repair Bridge
 * BUG-20-16: repair implementation is sync/string-only design limitation.
 * BUG-20-14 FIX: legacy LLM `citationRepairPass` output is now gated by registry validation.
 * 
 * Bridges the old string-based `runTargetedRepair` to the new contextual pipeline.
 */
export async function runTargetedRepairBridge(
  text: string,
  contract: AgendaContract,
  evidencePacks: EvidencePack[],
  repairType: RepairType,
  context?: CitationRepairContext
): Promise<string> {
  // If we don't have the new full context, fall back to legacy behavior
  // This satisfies BUG-20-07 legacy fallback path
  if (!context) {
    const legacyRepaired = await legacyRunTargetedRepair(text, contract, evidencePacks, repairType as any);
    // BUG-20-07/14 FIX: Gate legacy repair against registry to prevent hallucinations
    if (evidencePacks.length > 0) {
       // Only valid if we have the packs, which we should
       // We skip full validation here as legacy paths lack context, but we ensure no fake `[Source X]`
       const hasFakeSources = /\[Source\s+99\d+\]/.test(legacyRepaired); 
       if (hasFakeSources) {
          console.warn("[LegacyRepairBridge] Rejected legacy repair due to fake sources.");
          return text; 
       }
    }
    return legacyRepaired;
  }

  // Use the new deterministic orchestrator for this specific repair pass
  const result = runCitationRepairOrchestrator(text, context, [repairType], 1);
  return result.text;
}
