/**
 * Brick 18 — Prompt budget protector.
 *
 * B18-10: Prompt compression priority order protects structured intelligence.
 * Compression order (first compressed first):
 *   1. Raw source text (fullText, topChunks)
 *   2. EvidencePacks (card text)
 *   3. Research angles
 *   4. ClaimLedger (compressed last among non-essential)
 *   5. ClaimGraph (compressed absolute last)
 *
 * B18-45: Post-forced-source budget check.
 */

export type PromptSection =
  | "raw_source_text"
  | "evidence_packs"
  | "research_angles"
  | "claim_ledger"
  | "claim_graph"
  | "division_context"
  | "output_contract";

/** Priority tiers — lower number = compressed first (sacrificed first). */
const COMPRESSION_PRIORITY: Record<PromptSection, number> = {
  raw_source_text: 1,
  evidence_packs: 2,
  research_angles: 3,
  division_context: 4,
  claim_ledger: 5,
  claim_graph: 6,
  output_contract: 7, // Never compressed
};

export interface BudgetCheckResult {
  withinBudget: boolean;
  estimatedTokens: number;
  maxTokens: number;
  compressionSuggestions: PromptSection[];
}

/**
 * Check if the prompt is within token budget after forced sources.
 * Returns compression suggestions ordered by priority (compress first).
 */
export function checkPromptBudget(
  promptText: string,
  maxTokens: number,
): BudgetCheckResult {
  const estimatedTokens = Math.ceil(promptText.length / 3.5);
  const withinBudget = estimatedTokens <= maxTokens;

  const suggestions: PromptSection[] = withinBudget
    ? []
    : (Object.entries(COMPRESSION_PRIORITY) as Array<[PromptSection, number]>)
        .sort((a, b) => a[1] - b[1])
        .filter(([section]) => section !== "output_contract")
        .map(([section]) => section);

  return {
    withinBudget,
    estimatedTokens,
    maxTokens,
    compressionSuggestions: suggestions,
  };
}

/**
 * Get the compression order for a section.
 * Lower number = compress first.
 */
export function getCompressionPriority(section: PromptSection): number {
  return COMPRESSION_PRIORITY[section] ?? 3;
}

/**
 * B18-45: Check if budget is exceeded after forced source injection.
 * If so, suggest trimming raw source text first.
 */
export function postForcedSourceBudgetCheck(
  promptWithForcedSources: string,
  maxTokens: number,
): { exceeded: boolean; overageTokens: number; trimFirst: PromptSection } {
  const estimatedTokens = Math.ceil(promptWithForcedSources.length / 3.5);
  return {
    exceeded: estimatedTokens > maxTokens,
    overageTokens: Math.max(0, estimatedTokens - maxTokens),
    trimFirst: "raw_source_text",
  };
}
