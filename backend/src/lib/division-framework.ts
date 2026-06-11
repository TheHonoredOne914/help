import { resolveActiveDimensions } from "./rag.js";
import type { DimensionEngineOutput, DimensionName, EvidenceTier } from "./types.js";

export interface Division {
  id: string;
  name: string;
  number: number;
  alwaysPresent: boolean;
  activationCondition?: (engine: DimensionEngineOutput) => boolean;
  minWordsForPrimary: number;
  minWordsForSecondary: number;
  evidenceTiers: EvidenceTier[];
  generateInstructions: (engine: DimensionEngineOutput) => string;
}

export const PARLIAMENTARY_REGISTER_RULES = `## PARLIAMENTARY REGISTER ENFORCEMENT
- NEVER use: "In the context of...", "This is a complex...", "Many experts believe...", "It can be argued..."
- Name every institution: "Article 21 of the Constitution" not "constitutional protections"
- Analytical voice: that of a senior parliamentary researcher - direct, specific, citation-anchored
- Every section opens with its strongest analytical claim, not background context
- Background context lives in Division 1 ONLY - all other Divisions assume the reader has Division 1
- No section may produce generic international MUN content when India-specific content exists`;

export const DIVISION_REGISTRY: Division[] = [
  {
    id: "core_brief",
    name: "DIVISION 1 - CORE BRIEF LAYER",
    number: 1,
    alwaysPresent: true,
    minWordsForPrimary: 400,
    minWordsForSecondary: 400,
    evidenceTiers: ["tier1", "tier2"],
    generateInstructions: (engine) => `Generate DIVISION 1 - CORE BRIEF LAYER.

Layer 1.1 - Agenda Snapshot: 3-4 dense sentences covering the issue, why it has reached this committee now, and the core tension.
Layer 1.2 - Historical Genesis: Name specific Acts, constitutional provisions, prior committee discussions, landmark court rulings, and significant policy events.
Layer 1.3 - Current Status: Pending bills, current government position, ongoing court cases, recent events, ministerial statements, and parliamentary questions.
Layer 1.4 - The Central Tension: A single analytical paragraph naming the core contradiction.
Layer 1.5 - Committee Jurisdiction: Explain why ${engine.committeeType.replace(/_/g, " ").toUpperCase()} can handle this issue and what it cannot do.

SPECIFICITY STANDARD: Every claim must anchor to a named provision, institution, event, or data point.`,
  },
  {
    id: "analytical_dimensions",
    name: "DIVISION 2 - DYNAMIC ANALYTICAL DIMENSIONS",
    number: 2,
    alwaysPresent: true,
    minWordsForPrimary: 500,
    minWordsForSecondary: 250,
    evidenceTiers: ["tier1", "tier2", "tier3", "tier4"],
    generateInstructions: buildDivision2Instructions,
  },
  {
    id: "stakeholder_mapping",
    name: "DIVISION 3 - STAKEHOLDER MAPPING",
    number: 3,
    alwaysPresent: true,
    minWordsForPrimary: 350,
    minWordsForSecondary: 250,
    evidenceTiers: ["tier2", "tier4", "tier5"],
    generateInstructions: buildDivision3Instructions,
  },
  {
    id: "conflict_mapping",
    name: "DIVISION 4 - CONFLICT & TENSION MAPPING",
    number: 4,
    alwaysPresent: true,
    minWordsForPrimary: 350,
    minWordsForSecondary: 250,
    evidenceTiers: ["tier1", "tier2", "tier4"],
    generateInstructions: buildDivision4Instructions,
  },
  {
    id: "narrative_analysis",
    name: "DIVISION 5 - NARRATIVE ANALYSIS",
    number: 5,
    alwaysPresent: true,
    minWordsForPrimary: 350,
    minWordsForSecondary: 250,
    evidenceTiers: ["tier2", "tier4", "tier5"],
    generateInstructions: buildDivision5Instructions,
  },
  {
    id: "evidence_verification",
    name: "DIVISION 6 - EVIDENCE & VERIFICATION LAYER",
    number: 6,
    alwaysPresent: true,
    minWordsForPrimary: 350,
    minWordsForSecondary: 250,
    evidenceTiers: ["tier1", "tier2", "tier3", "tier4", "tier5"],
    generateInstructions: buildDivision6Instructions,
  },
  {
    id: "debate_utility",
    name: "DIVISION 7 - DEBATE UTILITY ARSENAL",
    number: 7,
    alwaysPresent: true,
    minWordsForPrimary: 700,
    minWordsForSecondary: 500,
    evidenceTiers: ["tier1", "tier2", "tier3", "tier4"],
    generateInstructions: buildDivision7Instructions,
  },
  {
    id: "policy_pathways",
    name: "DIVISION 8 - POLICY PATHWAYS",
    number: 8,
    alwaysPresent: true,
    minWordsForPrimary: 350,
    minWordsForSecondary: 250,
    evidenceTiers: ["tier1", "tier2", "tier3", "tier5"],
    generateInstructions: buildDivision8Instructions,
  },
  {
    id: "predictive_analysis",
    name: "DIVISION 9 - PREDICTIVE ANALYSIS",
    number: 9,
    alwaysPresent: true,
    minWordsForPrimary: 300,
    minWordsForSecondary: 220,
    evidenceTiers: ["tier2", "tier3", "tier4", "tier5"],
    generateInstructions: buildDivision9Instructions,
  },
  {
    id: "resolution_support",
    name: "DIVISION 10 - RESOLUTION SUPPORT SYSTEM",
    number: 10,
    alwaysPresent: true,
    minWordsForPrimary: 350,
    minWordsForSecondary: 250,
    evidenceTiers: ["tier1", "tier2", "tier4"],
    generateInstructions: buildDivision10Instructions,
  },
  {
    id: "strategic_insights",
    name: "DIVISION 11 - STRATEGIC INSIGHTS LAYER",
    number: 11,
    alwaysPresent: true,
    minWordsForPrimary: 500,
    minWordsForSecondary: 350,
    evidenceTiers: ["tier1", "tier2", "tier4", "tier5"],
    generateInstructions: buildDivision11Instructions,
  },
];

function label(name: string): string {
  return name.toUpperCase().replace(/_/g, " ");
}

export function buildDivision2Instructions(engine: DimensionEngineOutput): string {
  const { mergedPrimary, absorbedDimensions } = resolveActiveDimensions(engine);
  const inverseMergeMap: Partial<Record<DimensionName, DimensionName>> = {
    constitutional: "judiciary",
    diplomatic: "international_relations",
    political: "public_sentiment",
  };
  const primaryNames = mergedPrimary.map((d) => d.name);
  const secondaryNames = engine.secondaryDimensions.map((d) => d.name);
  const primaryInstructions = mergedPrimary.map((dim) => {
    const absorbed = inverseMergeMap[dim.name];
    const includesAbsorbed = absorbed && absorbedDimensions.includes(absorbed);
    return `
## ${label(dim.name)} - ANALYTICAL PROFILE${includesAbsorbed ? ` (INCORPORATING ${label(absorbed)})` : ""} [PRIMARY DIMENSION]

Minimum 500 words. Structure:
**The Core Argument:** State the fundamental claim this dimension makes about this specific agenda, not a general definition.
**The Indian Context:** Name institutions, provisions, cases, and current political structure. No generic statements.
**Key Data & Evidence Points:** Every evidence point must cite [Source N](url). If evidence is absent, write "SOURCE GAP: [topic]."
**The Fault Lines:** 2-3 precise unresolved sub-questions that current evidence cannot settle.
**Cross-Dimension Interaction:** Connect this dimension to ${primaryNames.filter((n) => n !== dim.name).join(", ") || "the other active dimensions"} with specific tensions or reinforcements.
${includesAbsorbed ? `**${label(absorbed)} Integration:** Address judicial precedent, enforcement, court interpretation, and litigation risk inside this profile, not as a separate silo.` : ""}
`;
  }).join("\n");

  const secondaryInstructions = engine.secondaryDimensions.map((dim) => `
## ${label(dim.name)} - CONDENSED PROFILE [SECONDARY DIMENSION]

**Core Argument:** 2 sentences.
**Indian Context:** 2-3 India-specific sentences naming institutions or provisions.
**Key Fault Lines:** 1 precise unresolved sub-question.
`).join("\n");

  return `Generate DIVISION 2 - DYNAMIC ANALYTICAL DIMENSIONS.

ACTIVE PRIMARY DIMENSIONS: ${primaryNames.join(", ")}
ACTIVE SECONDARY DIMENSIONS: ${secondaryNames.join(", ")}
ABSORBED DIMENSIONS: ${absorbedDimensions.join(", ") || "none"}
SECTION ORDER: Lead with ${mergedPrimary[0]?.name ?? "constitutional"}.

${primaryInstructions}
${secondaryInstructions}

${PARLIAMENTARY_REGISTER_RULES}`;
}

export function buildDivision3Instructions(engine: DimensionEngineOutput): string {
  const includeInternational = hasAnyDimension(engine, ["diplomatic", "international_relations"]);
  const includeCentreState = hasAnyDimension(engine, ["federalism"]) || engine.committeeType === "aippm";
  return `Generate DIVISION 3 - STAKEHOLDER MAPPING.

Layer 3.1 - Primary Stakeholders: Ruling government, opposition, relevant ministries, committee itself. For each: formal position, justification, underlying interest, red lines, flexibility.
Layer 3.2 - Institutional Stakeholders: Supreme Court, Election Commission, RBI, CBI, NHRC, SEBI, CAG, or only those relevant.
${includeCentreState ? "Layer 3.3 - State-Level Stakeholders: Map state blocs by political alignment and regional interest. Name specific states." : ""}
Layer 3.4 - Civil Society & Advocacy: NGOs, legal organizations, trade unions, industry bodies, civil liberties groups.
${includeInternational ? "Layer 3.5 - International Stakeholders: Foreign governments, multilateral bodies, courts, diaspora, and leverage." : ""}
Layer 3.6 - Stakeholder Alliance Map: Natural alignments, tensions, and unexpected coalitions.`;
}

export function buildDivision4Instructions(engine: DimensionEngineOutput): string {
  const includeCentreState = hasAnyDimension(engine, ["federalism"]) || engine.committeeType === "aippm";
  const includeLegalPolitical = hasAnyDimension(engine, ["constitutional", "judiciary"]);
  return `Generate DIVISION 4 - CONFLICT & TENSION MAPPING.

Layer 4.1 - Primary Conflicts: Name the 2-3 structural contradictions.
Layer 4.2 - Intra-Government Conflicts: Where ministries, coalition actors, or bureaucratic bodies are not aligned.
${includeCentreState ? "Layer 4.3 - Centre-State Conflicts: Name states and provisions in dispute." : ""}
${includeLegalPolitical ? "Layer 4.4 - Legal-Political Conflicts: Where political desire conflicts with constitutional constraints or judicial interpretation." : ""}
Layer 4.5 - Value Conflicts: Development vs rights, security vs liberty, majoritarian democracy vs minority protections, sovereignty vs integration.
Layer 4.6 - Conflict Escalation Pathways: Conditions that convert disputes into constitutional crisis, inter-state confrontation, or public order stress.`;
}

export function buildDivision5Instructions(engine: DimensionEngineOutput): string {
  const includeJudicial = hasAnyDimension(engine, ["constitutional", "judiciary"]);
  const includeInternational = hasAnyDimension(engine, ["diplomatic", "international_relations"]);
  return `Generate DIVISION 5 - NARRATIVE ANALYSIS.

CRITICAL RULE: Analyze narratives equally and flag perspective drift.
Layer 5.1 - Government Narrative: Rationale, public language, actions, interests, coherence, weaknesses.
Layer 5.2 - Opposition Narrative: Principled objection, political calculation, party divergence, coherence, weaknesses.
Layer 5.3 - Expert & Academic Narrative: Dominant expert view, dissent, and blind spots.
${includeJudicial ? "Layer 5.4 - Judicial Narrative: Supreme Court and High Court framing through rulings, obiter, and stays." : ""}
Layer 5.5 - Media & Information Environment: English, Hindi, regional, and social media framings plus misinformation vectors.
${includeInternational ? "Layer 5.6 - International Narrative: Global media, foreign governments, and international bodies." : ""}
Layer 5.7 - Narrative Interaction Analysis: Clashes, reinforcements, dominance, coherence, and vulnerability to factual challenge.`;
}

export function buildDivision6Instructions(engine: DimensionEngineOutput): string {
  return `Generate DIVISION 6 - EVIDENCE & VERIFICATION LAYER.

Layer 6.1 - Tier 1: Constitutional and statutory sources, Articles, Sections, Supreme Court judgements.
Layer 6.2 - Tier 2: Parliamentary record, committee reports, CAG, government white papers.
Layer 6.3 - Tier 3: Government data from NITI Aayog, ministries, RBI, NSO, Census.
Layer 6.4 - Tier 4: Expert research from ORF, PRS, CPR, EPW, IDSA, ICRIER.
Layer 6.5 - Tier 5: Comparative international evidence.
Layer 6.6 - Contested Evidence Register: Disputed or selectively used data points.
Layer 6.7 - Evidence Gaps: Missing or insufficient data that delegates can turn into mandates.

GENERATION NOTE: Evidence priority for this agenda is ${engine.structuralDNA.evidencePriority.join(", ")}.`;
}

export function buildDivision7Instructions(engine: DimensionEngineOutput): string {
  const registerCalibration: Record<typeof engine.structuralDNA.debateRegister, string> = {
    combative: `
COMBATIVE REGISTER ENFORCEMENT:
- Arguments must use assertive, declarative language: "India's position is unequivocal."
- POIs must be direct challenges: "Would the delegate explain why [position] contradicts [evidence]?"
- Rebuttals must use rhetorical escalation: "This argument fails on three grounds..."
- Avoid qualifiers: never write "may", "might", "perhaps", "could be"`,
    diplomatic: `
DIPLOMATIC REGISTER ENFORCEMENT:
- Arguments must acknowledge common ground before stating position
- POIs must be constructive: "Would the delegate consider that..."
- Use bridge language: "While understanding [position], India maintains..."`,
    technical: `
TECHNICAL REGISTER ENFORCEMENT:
- Arguments must lead with data, not assertion
- Every claim must have a specific citation: number, percentage, report name
- Avoid rhetorical language - prefer analytical precision`,
    deliberative: `
DELIBERATIVE REGISTER ENFORCEMENT:
- Arguments must present multiple perspectives before advocating a position
- POIs should seek clarification, not challenge: "Could the delegate elaborate on..."
- Language should invite coalition building`,
  };
  const requiredTargets = [
    "Government/ruling coalition position",
    "Opposition position",
    ...(hasAnyDimension(engine, ["diplomatic", "international_relations"]) ? ["International/foreign pressure position"] : []),
    ...(hasAnyDimension(engine, ["human_rights", "media_information"]) ? ["Civil society/watchdog position"] : []),
  ];
  const formatEnforcement = `
## POINT OF INFORMATION FORMAT - ALL 15-20 POIs MUST follow one of these patterns:
Pattern A (Challenge): "Would the Honourable delegate from [Party/Position] acknowledge that [specific claim from Source N]?"
Pattern B (Evidence-trap): "Is the delegation aware that [specific data point from Source N], which directly contradicts [their stated position]?"
Pattern C (Logic-lock): "Could the delegation explain the contradiction between their support for [X] and their opposition to [Y], given [Source N] evidence?"

FORBIDDEN POI pattern: "What is India's position on [topic]?"
REQUIRED POI content: every POI must name a specific party/position, a specific fact from evidence, and a specific contradiction or implication.

## REBUTTAL MATRIX FORMAT - ALL 5+ REBUTTALS MUST follow this exact structure:
"When [Party or bloc] argues [specific claim], respond: [counter-argument anchored to Source N]. Logical weakness in their position: [specific vulnerability]. Follow-up POI to lock in the rebuttal: [one POI]."

MANDATORY REBUTTAL TARGETS:
${requiredTargets.map((target) => `- ${target}`).join("\n")}
`;

  return `Generate DIVISION 7 - DEBATE UTILITY ARSENAL.

${formatEnforcement}

${registerCalibration[engine.structuralDNA.debateRegister]}

This division is generated last from Divisions 1-6. Debate register: ${engine.structuralDNA.debateRegister.toUpperCase()}.
Layer 7.1 - Core Position Statements: 3-4 ready-to-deliver paragraphs by stance.
Layer 7.2 - Primary Arguments Bank: 6-8 arguments with claim, evidence, logic type, dimension, persuasion target.
Layer 7.3 - Rebuttal Matrix: "When [Party X] argues [Claim Y], respond with [Counter-Claim Z] supported by [Evidence Source]. Weakness: [W]."
Layer 7.4 - Point of Information Arsenal: 15-20 POIs by dimension and challenge type.
Layer 7.5 - Counterargument Anticipation: Top 5 opposing arguments with counter-positions.
Layer 7.6 - Alliance & Coalition Map: Natural allies, possible allies, unreachable opponents, swing delegates.
Layer 7.7 - Negotiation Leverage Points: Concede/gain/language.
Layer 7.8 - Red Lines Register: Non-compromise issues.`;
}

export function buildDivision8Instructions(engine: DimensionEngineOutput): string {
  const includeFederalism = hasAnyDimension(engine, ["federalism"]) || engine.committeeType === "aippm";
  const includeInternational = hasAnyDimension(engine, ["diplomatic", "international_relations"]);
  return `Generate DIVISION 8 - POLICY PATHWAYS.

Layer 8.1 - Policy Status Quo Analysis: Best/base/worst cases under inaction.
Layer 8.2 - Policy Option Matrix: 3-5 options with mechanics, winners/losers, constitutional compatibility, feasibility, precedent, horizon.
Layer 8.3 - Legislative vs Executive vs Judicial Pathways: Name which pathway is required.
${includeFederalism ? "Layer 8.4 - Federalism Compliance Check: Union List, State List, Concurrent List, state consent, challenge risk." : ""}
${includeInternational ? "Layer 8.5 - International Obligation Compatibility: Treaty, sanctions, diplomatic backlash, arbitration risk." : ""}`;
}

export function buildDivision9Instructions(engine: DimensionEngineOutput): string {
  const includeCrisis = engine.agendaClass === "crisis" || engine.committeeType === "crisis" || hasAnyDimension(engine, ["security", "social_stability"]);
  const includeElectoral = hasAnyDimension(engine, ["electoral", "political"]);
  return `Generate DIVISION 9 - PREDICTIVE ANALYSIS.

Layer 9.1 - Short-Term Trajectory (0-18 months): Elections, hearings, budgets, diplomatic deadlines.
Layer 9.2 - Medium-Term Consequences (1-5 years): Indicators, social cohesion, federal balance, judicial workload, institutional trust.
${includeCrisis ? "Layer 9.3 - Crisis Escalation Scenarios: Named scenarios with trigger conditions." : ""}
${includeElectoral ? "Layer 9.4 - Electoral Implications: Ruling coalition, regional parties, opposition." : ""}
Layer 9.5 - Precedent Risks: Future policy, constitutional interpretation, and international positioning.`;
}

export function buildDivision10Instructions(): string {
  return `Generate DIVISION 10 - RESOLUTION SUPPORT SYSTEM.

Layer 10.1 - Resolution Drafting Framework: Operative categories, preambulatory anchors, sequence.
Layer 10.2 - Essential Operative Clauses: 4-6 non-negotiable provisions.
Layer 10.3 - Optional Enhancement Clauses: Monitoring, timelines, review, reporting, funding.
Layer 10.4 - Legally Dangerous Clause Warnings: Ultra vires or jurisdiction-breaking language.
Layer 10.5 - Amendment Strategy: Vulnerable clauses, resilient drafting, acceptable concessions.
Layer 10.6 - Resolution Success Criteria: Constitutional soundness, stakeholder viability, implementation realism, precedent quality.`;
}

export function buildDivision11Instructions(): string {
  return `Generate DIVISION 11 - STRATEGIC INSIGHTS LAYER.

This is additive intelligence, not a summary.
Layer 11.1 - The Strategic Diagnosis: Direct assessment of what the committee actually needs to do.
Layer 11.2 - Power Geometry Analysis: Who controls the outcome politically, not formally.
Layer 11.3 - Unspoken Assumptions: Hidden premises that reframe the debate.
Layer 11.4 - The Trap Register: Strong-looking but self-defeating arguments or proposals.
Layer 11.5 - The Winning Frame: Single defensible frame that gives structural debate advantage.
Layer 11.6 - Long-Arc Perspective: What the outcome means for India's institutional trajectory.`;
}

function hasAnyDimension(engine: DimensionEngineOutput, names: string[]): boolean {
  return [...engine.primaryDimensions, ...engine.secondaryDimensions].some((d) => names.includes(d.name));
}
