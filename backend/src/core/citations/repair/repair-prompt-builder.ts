/**
 * Brick 20 — Repair prompt builder.
 *
 * BUG-20-28 FIX: Wires buildRepairPromptTemplate from legacy orchestrator
 * into modular repair for LLM-assisted repair when deterministic is insufficient.
 */

import type { CitationRepairContext } from "./types.js";
import type { AgendaContract } from "../../agenda/agenda-contract.js";

/**
 * Build the system prompt for an LLM repair pass.
 */
export function buildRepairSystemPrompt(
  repairType: string,
  contract: AgendaContract,
): string {
  const isFormatting = repairType === "indian_parliamentary_framing_repair" || repairType === "un_framing_repair";

  if (isFormatting) {
    return [
      "You are a strict text editor for an Indian Mock Parliament research platform.",
      "Your task is to correct formatting, framing, or specific problematic phrases in the provided text.",
      "CRITICAL RULE: You must preserve all existing [Source N](url) citations exactly as they appear.",
      "Do NOT invent new facts. Do NOT change the meaning of the research.",
      `Context: ${contract.normalizedAgenda}`,
    ].join("\n");
  }

  return [
    "You are a strict citation and evidence repair module for an Indian Mock Parliament research platform.",
    "Your task is to fix factual, legal, or citation errors in the provided draft text.",
    "CRITICAL RULES:",
    "1. You must preserve existing valid [Source N](url) citations.",
    "2. If a claim is unsupported, you must qualify it (e.g. 'It is alleged...', 'Without conclusive registry proof...') or remove it.",
    "3. Do NOT invent new citations.",
    "4. Do NOT assert legal holdings, electoral fraud, or unconstitutional acts as absolute facts without citing the registry.",
    `Context: ${contract.normalizedAgenda}`,
  ].join("\n");
}

/**
 * Build the user prompt for an LLM repair pass.
 */
export function buildRepairPromptTemplate(
  draftText: string,
  repairType: string,
  context: CitationRepairContext,
  specificInstructions: string,
): string {
  return [
    `Repair Task: ${repairType}`,
    "",
    "Instructions:",
    specificInstructions,
    "",
    "Source Base (Do NOT cite these if they are not already in the draft, but use them to understand what is supported):",
    ...context.sourceUsageMaps.flatMap((map) =>
      map.sourceUsageMap.slice(0, 5).map((item) => `- Source ${item.sourceId}: ${item.extractedClaim ?? item.legalHolding ?? "relevant context"}`),
    ),
    "",
    "Draft Text to Repair:",
    "---",
    draftText,
    "---",
    "",
    "Output ONLY the repaired text. Do not include introductory remarks.",
  ].join("\n");
}
