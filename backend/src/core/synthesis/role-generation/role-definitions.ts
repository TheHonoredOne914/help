import type { RoleDefinition, RoleGenerationRoleName } from "./types.js";

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    name: "retrieval_critic",
    label: "Retrieval critic",
    supportedSections: ["source_gap_report", "evidence_verification", "strategic_insights"],
    focus: ["weak sources", "source gaps", "missing buckets", "overused source classes", "limited/snippet evidence"],
    primaryUsageTypes: ["limitation_identified", "used_for_reliability_matrix", "relevant_but_weak"],
  },
  {
    name: "evidence_extractor",
    label: "Evidence extractor",
    supportedSections: ["evidence_verification", "core_brief", "analytical_dimensions"],
    focus: ["precise facts", "numbers", "legal holdings", "source-grounded claims"],
    primaryUsageTypes: ["fact_extracted", "number_extracted", "legal_holding_extracted", "supports_claim"],
  },
  {
    name: "thesis_synthesizer",
    label: "Thesis synthesizer",
    supportedSections: ["strategic_insights", "core_brief", "conflict_mapping"],
    focus: ["claim spine", "central contradiction", "argument structure", "cross-source synthesis"],
    primaryUsageTypes: ["supports_claim", "challenges_claim", "used_for_debate_utility"],
  },
  {
    name: "citation_auditor",
    label: "Citation auditor",
    supportedSections: ["evidence_verification", "citation_audit", "strategic_insights"],
    focus: ["citation safety", "source strength", "snippet limitations", "unsupported claims"],
    primaryUsageTypes: ["used_for_citation_audit", "used_for_reliability_matrix", "limitation_identified"],
  },
  {
    name: "indian_parliamentary_strategist",
    label: "Indian parliamentary strategist",
    supportedSections: ["debate_utility", "resolution_support", "strategic_insights"],
    focus: ["Treasury Bench", "Opposition", "POIs", "rebuttals", "motions", "amendments"],
    primaryUsageTypes: ["used_for_debate_utility", "supports_claim", "challenges_claim"],
  },
  {
    name: "final_quality_auditor",
    label: "Final quality auditor",
    supportedSections: ["final_quality_audit", "strategic_insights", "evidence_verification"],
    focus: ["role output audit", "low-confidence claims", "source weakness", "final-use risks"],
    primaryUsageTypes: ["used_for_citation_audit", "limitation_identified", "challenges_claim"],
  },
  {
    name: "legal_analyst",
    label: "Legal analyst",
    supportedSections: ["legal_analysis", "analytical_dimensions", "debate_utility"],
    focus: ["court holdings", "constitutional provisions", "Articles", "Supreme Court", "High Court", "ECI", "parliamentary committee material"],
    primaryUsageTypes: ["legal_holding_extracted", "supports_claim", "challenges_claim"],
  },
  {
    name: "data_analyst",
    label: "Data analyst",
    supportedSections: ["data_statistics", "evidence_verification", "debate_utility"],
    focus: ["statistics", "rankings", "trends", "datasets", "methodology weaknesses", "numeric contradictions"],
    primaryUsageTypes: ["number_extracted", "supports_claim", "limitation_identified"],
  },
];

export const SOURCE_USAGE_ROLE_NAMES = ROLE_DEFINITIONS.map((definition) => definition.name);

export function getRoleDefinition(roleName: string): RoleDefinition {
  const normalized = normalizeRoleName(roleName);
  return ROLE_DEFINITIONS.find((definition) => definition.name === normalized)
    ?? {
      name: roleName,
      label: "Safe default role",
      supportedSections: ["evidence_verification"],
      focus: ["source-grounded evidence", "citation-safe claims", "Indian parliamentary relevance"],
      primaryUsageTypes: ["fact_extracted", "limitation_identified", "relevant_but_weak"],
    };
}

export function isKnownRole(roleName: string): roleName is RoleGenerationRoleName {
  const normalized = normalizeRoleName(roleName);
  return ROLE_DEFINITIONS.some((definition) => definition.name === normalized);
}

export function normalizeRoleName(roleName: string): string {
  return roleName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}
