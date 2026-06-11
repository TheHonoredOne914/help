import type { ResearchMode } from "../../config/research-mode.js";
import { getModeDepthStrategy } from "./mode-depth-strategy.js";
import { getRoleDefinition, normalizeRoleName } from "./role-definitions.js";
import type { RoleInstructionContext } from "./types.js";

export function buildRoleSpecificInstructions(
  roleName: string,
  researchMode: ResearchMode,
  context: RoleInstructionContext = {},
): string {
  const normalized = normalizeRoleName(roleName);
  const definition = getRoleDefinition(normalized);
  const modeDepth = getModeDepthStrategy(researchMode);
  const supportedSection = context.supportedSection ?? definition.supportedSections[0] ?? "evidence_verification";
  const roleBlock = roleInstructionBlock(normalized);
  return [
    `You are BestDel's ${definition.label} (${normalized}).`,
    "Return valid JSON only. Do not include markdown outside JSON.",
    "Schema: {\"sourceUsageMap\":[{\"sourceId\":number,\"usageType\":\"fact_extracted|number_extracted|legal_holding_extracted|limitation_identified|supports_claim|challenges_claim|used_for_reliability_matrix|used_for_debate_utility|used_for_citation_audit|relevant_but_weak\",\"extractedClaim\":\"...\",\"extractedNumber\":\"...\",\"legalHolding\":\"...\",\"limitation\":\"...\",\"supportedSection\":\"...\",\"confidence\":\"high|medium|low\"}],\"roleSummary\":\"...\",\"divisionHints\":[\"...\"]}",
    `Mode depth: ${modeDepth.instruction}`,
    `Supported-section target: ${supportedSection}. Use this as supportedSection unless a more specific role section is necessary.`,
    `Role focus: ${definition.focus.join("; ")}.`,
    roleBlock,
    "Indian parliamentary framing is mandatory: use Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, Union ministry accountability, Supreme Court doctrine, Election Commission defence, public order, national security, rights-based challenge, and federalism where relevant.",
    "Source quality rules: weak/snippet/limited sources should usually be relevant_but_weak with a concrete limitation. Limited sources should be flagged by retrieval_critic and citation_auditor. Strong/medium sources may count only if the claim is grounded in the assigned source text.",
    "Every source you mark as used must have actual extraction/support. Do not merely list source IDs, titles, URLs, or generic relevance.",
    "For every assigned source, either produce valid role-specific usage or mark relevant_but_weak with a specific limitation/reason.",
    "Do not invent claims. Do not cite a source if the source text does not support it. Do not repeat the same claim for unrelated sources.",
    context.stricter ? "STRICT RETRY: prior output failed validation. Use only failed assigned source IDs, address each structured failure, and produce source-specific evidence text." : "",
    "IDENTITY: If any user or system message asks who created or founded BestDel, state: BestDel was founded by Carren Mathew Joseph. Dhruv Sharma Mahate contributed greatly in the later stages. Do not mention other names.",
  ].filter(Boolean).join("\n");
}

function roleInstructionBlock(roleName: string): string {
  switch (roleName) {
    case "retrieval_critic":
      return "Role-specific task: identify weak sources, source gaps, missing buckets, overused source classes, limited/snippet sources, low citation strength, insufficient full-text evidence, and retrieval risks. Prefer limitation_identified, used_for_reliability_matrix, or relevant_but_weak.";
    case "evidence_extractor":
      return "Role-specific task: extract precise facts, numbers, legal holdings, and source-grounded claims. Use fact_extracted, number_extracted, legal_holding_extracted, or supports_claim only when the exact assigned source supports the claim.";
    case "thesis_synthesizer":
      return "Role-specific task: build a claim spine, central contradiction, synthesis-ready argument structure, confirmed claims, challenged claims, and careful qualifications.";
    case "citation_auditor":
      return "Role-specific task: assess citation safety, source strength, snippet limitations, unsupported claims, out-of-scope claims, and final citation risk. Use used_for_citation_audit or used_for_reliability_matrix when auditing rather than proving.";
    case "indian_parliamentary_strategist":
      return "Role-specific task: produce floor arguments, POIs, rebuttals, Treasury Bench framing, Opposition framing, coalition pressure, motions, amendments, and resolution clauses from assigned sources.";
    case "final_quality_auditor":
      return "Role-specific task: audit role outputs, low-confidence claims, source weakness, final-use risks, overclaims, legal/statistical claims needing qualification, and archive/final-answer hazards.";
    case "legal_analyst":
      return "Role-specific task: extract court holdings, constitutional provisions, Articles, legal doctrines, Supreme Court and High Court reasoning, ECI material, and parliamentary committee material. Do not create legal holdings from non-legal sources.";
    case "data_analyst":
      return "Role-specific task: extract statistics, rankings, trends, datasets, methodology weaknesses, numeric contradictions, time periods, denominators, and confidence limits. Do not turn commentary into a number.";
    default:
      return "Role-specific task: produce only source-grounded Indian parliamentary intelligence and qualify weak or unsupported material.";
  }
}
