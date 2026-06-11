import type { ResearchMode } from "../../config/research-mode.js";
import type { EvidenceCard } from "../../evidence/evidence-pack-builder.js";
import { buildRoleBatchPrompt } from "./role-batch-prompt.js";
import { buildRoleSpecificInstructions } from "./role-specific-instructions.js";
import type { RolePrompt } from "./types.js";

export interface BuildRolePromptInput {
  roleName: string;
  researchMode: ResearchMode;
  cards: EvidenceCard[];
  claimGraphContext?: string;
  sourceGapContext?: string;
  stricter?: boolean;
  retryInstruction?: string;
}

export function buildRolePrompt(input: BuildRolePromptInput): RolePrompt {
  const supportedSection = supportedSectionForRole(input.roleName);
  const system = [
    buildRoleSpecificInstructions(input.roleName, input.researchMode, {
      supportedSection,
      stricter: input.stricter,
    }),
    input.retryInstruction,
  ].filter(Boolean).join("\n\n");
  const user = [
    input.claimGraphContext || "ClaimGraph Context: none",
    input.sourceGapContext || "SourceGapReport Context: none",
    buildRoleBatchPrompt(input.cards, { roleName: input.roleName }),
  ].join("\n\n");
  return { system, user };
}

export function buildSourceUsageSystemPrompt(roleName: string, stricter = false): string {
  return buildRoleSpecificInstructions(roleName, "deep_research", { stricter });
}

function supportedSectionForRole(roleName: string): string {
  if (/parliamentary|strategist/i.test(roleName)) return "debate_utility";
  if (/legal/i.test(roleName)) return "legal_analysis";
  if (/data|stat/i.test(roleName)) return "data_statistics";
  if (/citation|quality/i.test(roleName)) return "evidence_verification";
  if (/thesis|synthes/i.test(roleName)) return "strategic_insights";
  if (/retrieval|critic|gap/i.test(roleName)) return "source_gap_report";
  return "evidence_verification";
}
