import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { QueryRoutingResult } from "./context-router.js";

export interface ResearchAngle {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  parliamentaryUse: string;
  bestSide: "treasury" | "opposition" | "both" | "neutral";
  debateValueScore: number;
  evidenceStrengthEstimate: "high" | "medium" | "low";
  sourceBucketsNeeded: string[];
  likelyArguments: string[];
  likelyCounters: string[];
  suggestedPOIs: string[];
  connectedDimensions: string[];
  suggestedDivisions: string[];
}

export interface GenerateResearchAnglesInput {
  agendaContract: AgendaContract;
  archiveRouting?: QueryRoutingResult | null;
  archiveAngleGraph?: { topic?: string; validatedAngles?: string[] } | null;
}

export function generateResearchAngles(input: GenerateResearchAnglesInput): ResearchAngle[] {
  const contract = input.agendaContract;
  const base = contract.topicType === "indian_democratic_space" ? democraticSpaceAngles() : genericIndianAngles();
  const archiveAngles = input.archiveRouting?.relationType === "unrelated"
    ? []
    : (input.archiveAngleGraph?.validatedAngles ?? []).filter((angle) => /india|article|internet|press|uapa|fcra|election|court|rights/i.test(angle));

  for (const archived of archiveAngles) {
    base.unshift(makeAngle({
      id: `archive_${base.length + 1}`,
      title: archived,
      bestSide: "both",
      buckets: ["court_legal", "digital_rights", "press_freedom"],
      description: "Validated archive angle reused only as a research direction; it still requires independent retrieval before citation.",
      division: "strategic_insights",
    }));
  }

  return dedupeAngles(base).slice(0, contract.outputDepth === "brief" ? 5 : 10);
}

function democraticSpaceAngles(): ResearchAngle[] {
  return [
    makeAngle({ id: "constitutional", title: "Constitutional angle: Article 19 freedoms vs reasonable restrictions", bestSide: "both", buckets: ["court_legal", "government_official", "legal_commentary"], division: "analytical_dimensions" }),
    makeAngle({ id: "security_civil_liberties", title: "Civil liberties angle: UAPA national security defence vs dissent chilling effect", bestSide: "both", buckets: ["government_official", "human_rights_watchdog", "court_legal"], division: "conflict_mapping" }),
    makeAngle({ id: "fcra_civil_society", title: "Civil society angle: FCRA regulation vs NGO restriction", bestSide: "both", buckets: ["government_official", "civic_space", "human_rights_watchdog"], division: "stakeholder_mapping" }),
    makeAngle({ id: "digital_rights", title: "Internet shutdowns public order vs Article 19 proportionality", bestSide: "opposition", buckets: ["digital_rights", "court_legal", "government_official"], division: "evidence_verification" }),
    makeAngle({ id: "electoral", title: "Electoral integrity angle: EVM/VVPAT allegations vs ECI and Supreme Court position", bestSide: "treasury", buckets: ["electoral_integrity", "court_legal", "government_official"], division: "core_brief" }),
    makeAngle({ id: "press", title: "Press freedom angle: watchdog function vs national stability narrative", bestSide: "opposition", buckets: ["press_freedom", "indian_major_media", "government_official"], division: "debate_utility" }),
    makeAngle({ id: "judicial", title: "Judicial responses angle: courts as check vs institutional restraint", bestSide: "both", buckets: ["court_legal", "legal_commentary", "indian_major_media"], division: "strategic_insights" }),
    makeAngle({ id: "indices", title: "Democracy index decline vs methodology bias", bestSide: "both", buckets: ["democracy_index", "comparative_democracy", "academic_research"], division: "narrative_analysis" }),
    makeAngle({ id: "federalism", title: "Federalism angle: public order and state capacity in civil-liberties disputes", bestSide: "both", buckets: ["government_official", "court_legal", "parliamentary_records"], division: "policy_pathways" }),
    makeAngle({ id: "comparative", title: "Comparative democratic backsliding angle", bestSide: "neutral", buckets: ["comparative_democracy", "democracy_index", "academic_research"], division: "predictive_analysis" }),
  ];
}

function genericIndianAngles(): ResearchAngle[] {
  return [
    makeAngle({ id: "treasury", title: "Treasury accountability angle", bestSide: "treasury", buckets: ["government_official", "parliamentary_records"], division: "debate_utility" }),
    makeAngle({ id: "opposition", title: "Opposition rights challenge angle", bestSide: "opposition", buckets: ["court_legal", "indian_major_media"], division: "strategic_insights" }),
  ];
}

function makeAngle(args: { id: string; title: string; bestSide: ResearchAngle["bestSide"]; buckets: string[]; division: string; description?: string }): ResearchAngle {
  return {
    id: args.id,
    title: args.title,
    description: args.description ?? `Research this as an Indian Mock Parliament fault line, not a UN-style bloc issue.`,
    whyItMatters: "It turns a broad agenda into a clash between constitutional legitimacy, public accountability, and floor strategy.",
    parliamentaryUse: "Use it for POIs, rebuttals, amendment language, committee recommendations, and party-line pressure.",
    bestSide: args.bestSide,
    debateValueScore: args.bestSide === "both" ? 92 : 86,
    evidenceStrengthEstimate: "high",
    sourceBucketsNeeded: args.buckets,
    likelyArguments: ["Evidence shows institutional pressure that can be framed as accountability failure.", "The state can defend legality, security necessity, and procedural safeguards."],
    likelyCounters: ["Methodology, jurisdiction, and evidentiary threshold should be challenged before making absolute claims."],
    suggestedPOIs: ["Which source proves the claim rather than merely alleging it?", "Is the argument about legality, proportionality, or political accountability?"],
    connectedDimensions: ["constitutional", "political", "rights", "parliamentary_strategy"],
    suggestedDivisions: [args.division],
  };
}

function dedupeAngles(angles: ResearchAngle[]): ResearchAngle[] {
  const seen = new Set<string>();
  return angles.filter((angle) => {
    const key = angle.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
