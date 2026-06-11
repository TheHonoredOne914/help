import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { DimensionEngineOutput, DimensionName } from "../../lib/types.js";

const UNIVERSAL_SECTIONS = [
  "Executive Thesis",
  "Methodology and Source Base",
  "Research Angle Map",
  "Indian Mock Parliament Debate Utility Arsenal",
  "Final Strategic Synthesis",
];

const DIMENSION_SECTIONS: Partial<Record<DimensionName, string>> = {
  constitutional: "Constitutional and Legal Analysis",
  security: "National Security and Public Order Analysis",
  human_rights: "Human Rights and Civil Liberties Analysis",
  judiciary: "Judicial Record and Court Positions",
  electoral: "Electoral Integrity and Process",
  media_information: "Press Freedom and Information Space",
  federalism: "Centre-State and Federalism Dimensions",
  economic: "Economic Impact and Fiscal Analysis",
  diplomatic: "Foreign Policy and International Dimensions",
  technological: "Digital Rights and Technology Governance",
};

export function buildSectionPlan(contract: AgendaContract, dimensionWeights?: DimensionEngineOutput | null): string[] {
  const sections = new Set<string>();
  for (const section of UNIVERSAL_SECTIONS.slice(0, 3)) sections.add(section);

  for (const dimension of [
    ...(dimensionWeights?.primaryDimensions ?? []),
    ...(dimensionWeights?.secondaryDimensions ?? []),
  ]) {
    const section = DIMENSION_SECTIONS[dimension.name];
    if (section) sections.add(section);
  }

  switch (contract.topicType) {
    case "indian_democratic_space":
      sections.add("Democracy Indices and Measurement");
      sections.add("Government Counter-Narrative");
      sections.add("Comparative Position");
      break;
    case "indian_economic_policy":
      sections.add("Budget and Fiscal Analysis");
      sections.add("Stakeholder Economic Impact");
      break;
    case "indian_security_policy":
      sections.add("Legal Framework for Security");
      sections.add("Civil Liberties vs Security");
      break;
    case "indian_federalism":
      sections.add("Centre-State and Federalism Dimensions");
      sections.add("Union Ministry Accountability");
      break;
    case "indian_electoral_policy":
      sections.add("Electoral Integrity and Process");
      sections.add("Election Commission Defence");
      break;
    case "constitutional_law":
      sections.add("Constitutional and Legal Analysis");
      sections.add("Supreme Court Doctrine");
      break;
    default:
      break;
  }

  sections.add("Indian Mock Parliament Debate Utility Arsenal");
  sections.add("Source Reliability Matrix");
  sections.add("Evidence Gaps");
  sections.add("Final Strategic Synthesis");
  return [...sections];
}
