import type { EvidenceCard } from "../evidence/evidence-pack-builder.js";

export type DivisionId =
  | "D1_core_brief"
  | "D2_analytical_dimensions"
  | "D3_stakeholder_mapping"
  | "D4_conflict_mapping"
  | "D5_narrative_analysis"
  | "D6_evidence_verification"
  | "D7_debate_utility"
  | "D8_policy_pathways"
  | "D9_predictive_analysis"
  | "D10_resolution_support"
  | "D11_strategic_insights";

export interface DivisionQualityMetrics {
  wordCount: number;
  poiCount: number;
  rebuttalCount: number;
  citationAnchorCount: number;
  repetitionRatio: number;
}

export interface DivisionQualityResult {
  passed: boolean;
  issues: string[];
  metrics: DivisionQualityMetrics;
}

export interface DebateUtilityInput {
  agenda: string;
  cards: EvidenceCard[];
  fallback?: boolean;
}

export interface StrategicInsightsInput {
  agenda: string;
  priorDivisions: Map<string, string>;
  sourceAnchors?: string[];
  fallback?: boolean;
}

export interface DeterministicFallbackInput {
  agenda: string;
  reason: string;
  sourceAnchors?: string[];
}

export interface DeterministicFallback {
  divisionId: DivisionId;
  isFallback: true;
  text: string;
}

export interface QualitySynthesisResult {
  outputs: Map<DivisionId, string>;
  quality: Map<DivisionId, DivisionQualityResult>;
}

const DIVISION_IDS: DivisionId[] = [
  "D1_core_brief",
  "D2_analytical_dimensions",
  "D3_stakeholder_mapping",
  "D4_conflict_mapping",
  "D5_narrative_analysis",
  "D6_evidence_verification",
  "D7_debate_utility",
  "D8_policy_pathways",
  "D9_predictive_analysis",
  "D10_resolution_support",
  "D11_strategic_insights",
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countCitationAnchors(text: string): number {
  return (text.match(/\[Source\s+\d+\]\(https?:\/\/[^)\s]+\)/gi) ?? []).length;
}

function countPoiItems(text: string): number {
  return (text.match(/(?:^|\n)\s*(?:[-*]|\d+\.|POI\s*\d*:)\s*(?:POI\b|Which\b|What\b|How\b|Would\b|Can\b|Where\b|When\b|Why\b)[^\n?]*\?/gi) ?? []).length;
}

function countRebuttalItems(text: string): number {
  const section = text.split(/Rebuttal Matrix\s*:/i)[1]?.split(/\n\s*(?:Coalition Map|Red Lines|Amendment Language|Resolution Language)\s*:/i)[0] ?? text;
  return (section.match(/(?:^|\n)\s*(?:[-*]|\d+\.)?\s*(?:If|When)\s+[^\n]*(?:respond|rebut|pivot|concede|demand|force|separate)/gi) ?? []).length;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function baseMetrics(text: string, priorDivisions?: Map<string, string>): DivisionQualityMetrics {
  return {
    wordCount: wordCount(text),
    poiCount: countPoiItems(text),
    rebuttalCount: countRebuttalItems(text),
    citationAnchorCount: countCitationAnchors(text),
    repetitionRatio: priorDivisions ? calculateRepetitionRatio(text, priorDivisions) : 0,
  };
}

function isFallbackText(text: string): boolean {
  return /\bdeterministic fallback\b|\bfallback\b/i.test(text);
}

function hasPlaceholderText(text: string): boolean {
  return /\b(?:placeholder|todo|lorem|insert\s+(?:source|text|citation)|tbd)\b/i.test(text);
}

export function validateD7DebateUtility(text: string, options: { allowFallback?: boolean } = {}): DivisionQualityResult {
  const metrics = baseMetrics(text);
  const issues: string[] = [];

  if (!options.allowFallback && isFallbackText(text)) issues.push("D7 fallback output cannot pass as thesis-grade debate utility.");
  if (hasPlaceholderText(text)) issues.push("D7 contains placeholder text.");
  if (metrics.wordCount < 90) issues.push(`D7 useful word count is too low (${metrics.wordCount}); expected at least 90 words.`);
  if (!/Treasury Bench/i.test(text)) issues.push("D7 must include Treasury Bench arguments.");
  if (!/Opposition/i.test(text)) issues.push("D7 must include Opposition arguments.");
  if (metrics.poiCount < 6) issues.push(`D7 POI bank is too thin (${metrics.poiCount}); expected at least 6 source-pressure POIs.`);
  if (metrics.rebuttalCount < 5) issues.push(`D7 rebuttal matrix is too thin (${metrics.rebuttalCount}); expected at least 5 rebuttals.`);
  if (!hasAny(text, [/Coalition Map/i, /coalition pressure/i, /alliance map/i])) issues.push("D7 must include a coalition map or coalition-pressure note.");
  if (!hasAny(text, [/Red Lines/i, /red line/i, /non-negotiable/i])) issues.push("D7 must include debate red lines.");
  if (!hasAny(text, [/Amendment Language/i, /Resolution Language/i, /Operative Clause/i, /Preambular Clause/i])) {
    issues.push("D7 must include amendment or resolution language.");
  }
  if (metrics.citationAnchorCount < 3) issues.push(`D7 needs source anchors; found ${metrics.citationAnchorCount}.`);

  return { passed: issues.length === 0, issues, metrics };
}

export function validateD11StrategicInsights(text: string, priorDivisions: Map<string, string>): DivisionQualityResult {
  const metrics = baseMetrics(text, priorDivisions);
  const issues: string[] = [];

  if (isFallbackText(text)) issues.push("D11 fallback output cannot pass as thesis-grade strategic synthesis.");
  if (hasPlaceholderText(text)) issues.push("D11 contains placeholder text.");
  if (metrics.wordCount < 75) issues.push(`D11 useful word count is too low (${metrics.wordCount}); expected at least 75 words.`);
  if (!/Diagnosis\s*:/i.test(text)) issues.push("D11 must include Diagnosis.");
  if (!/Prescription\s*:/i.test(text)) issues.push("D11 must include Prescription.");
  if (!/Warning\s*:/i.test(text)) issues.push("D11 must include Warning.");
  if (metrics.repetitionRatio >= 0.2) issues.push(`D11 repeats earlier division content too heavily (${metrics.repetitionRatio.toFixed(2)}).`);
  if (metrics.citationAnchorCount < 1) issues.push("D11 needs at least one citation or source anchor.");

  return { passed: issues.length === 0, issues, metrics };
}

export function buildDebateUtilityDivision(input: DebateUtilityInput): string {
  const cards = input.cards.slice(0, 8);
  const cite = (index: number) => cards[index % Math.max(cards.length, 1)]?.citation ?? "[source gap]";
  const fact = (index: number) => {
    const card = cards[index % Math.max(cards.length, 1)];
    return card?.keyFacts[0] ?? card?.debateUse ?? "available evidence is limited, so the claim must be framed cautiously";
  };

  return [
    `D7 Debate Utility Arsenal${input.fallback ? " - Deterministic fallback" : ""}`,
    "",
    `Treasury Bench Arguments: Defend ${input.agenda} as accountable legality, not unchecked executive discretion. Use ${fact(0)} ${cite(0)}. Argue that public order, ministry accountability, and committee review can coexist if the House demands source-backed safeguards. Use ${fact(1)} ${cite(1)}.`,
    "",
    `Opposition Arguments: Attack overbreadth, weak disclosure, and rights-cost shifting. Use ${fact(2)} ${cite(2)}. Frame the floor strategy around proportionality, federalism objection, and Supreme Court doctrine instead of generic anti-government rhetoric. Use ${fact(3)} ${cite(3)}.`,
    "",
    "POI Bank:",
    `1. POI: Which source proves the ministry accountability mechanism for this policy? ${cite(0)}`,
    `2. POI: What constitutional safeguard prevents emergency language from becoming routine discretion? ${cite(1)}`,
    `3. POI: Where does the record distinguish public order from political convenience? ${cite(2)}`,
    `4. POI: Which court, statute, or committee record supports the claimed legal threshold? ${cite(3)}`,
    `5. POI: How will Treasury answer the rights-based challenge without ignoring federalism? ${cite(4)}`,
    `6. POI: What amendment would narrow the power while preserving legitimate state capacity? ${cite(5)}`,
    "",
    "Rebuttal Matrix:",
    `1. If Treasury invokes national security, respond by demanding necessity, proportionality, and reviewable reasons. ${cite(0)}`,
    `2. If Opposition claims bad faith, respond by separating allegation, source proof, and legal holding. ${cite(1)}`,
    `3. If federalism is dismissed, respond by tying state capacity to constitutional accountability. ${cite(2)}`,
    `4. If media evidence is attacked, respond by pivoting to official, parliamentary, or court anchors. ${cite(3)}`,
    `5. If the debate drifts into slogans, respond by forcing each side to table a sourced amendment. ${cite(4)}`,
    "",
    "Coalition Map: Treasury allies can support a narrow defence built on accountable legality; Opposition parties can unite around disclosure, rights impact, and federalism safeguards; cross-bench or regional delegates are movable if the motion protects state implementation space.",
    "Red Lines: no bare fraud claim, no uncited legal holding, no unlimited executive discretion, no social-media-only proof for legal or statistical claims, and no green success framing if source anchors are missing.",
    `Amendment Language: Insert an operative clause requiring a ministry report, independent rights-impact review, time-bound committee follow-up, and publication of reasons subject to lawful confidentiality. Resolution language should cite constitutional morality, public order limits, and parliamentary oversight. ${cite(5)}`,
  ].join("\n");
}

export function buildStrategicInsightsDivision(input: StrategicInsightsInput): string {
  const anchors = input.sourceAnchors?.length ? input.sourceAnchors.join(" ") : "[source gap]";
  const d1 = input.priorDivisions.get("D1_core_brief") ?? input.priorDivisions.get("core_brief") ?? "the core brief";
  const d7 = input.priorDivisions.get("D7_debate_utility") ?? input.priorDivisions.get("debate_utility") ?? "the debate utility arsenal";
  const d1Cue = extractStrategicTheme(d1);
  const d7Cue = extractStrategicTheme(d7);

  return [
    `D11 Strategic Insights${input.fallback ? " - Deterministic fallback" : ""}`,
    "",
    `Diagnosis: The strategic problem in ${input.agenda} is the gap between legal defensibility and floor credibility. ${d1Cue} supplies the governing constraint, while ${d7Cue} shows that the winning side is the one that converts evidence gaps into controlled parliamentary pressure rather than broad accusation. ${anchors}`,
    "",
    "Prescription: Treasury Bench should concede narrow evidentiary limits, lead with official or court anchors, and offer a review amendment before Opposition frames the issue as rights erosion. Opposition should attack proof quality, proportionality, federalism, and disclosure while avoiding unsourced absolute claims. The synthesis is not to repeat D1-D10; it is to decide which concessions, POIs, and clauses make each side credible.",
    "",
    "Warning: Any speech that summarizes earlier divisions, cites bare bracket numbers, or treats allegation as proof will fail under cross-examination. The risk is strategic overreach: Treasury loses if it sounds secretive, Opposition loses if it sounds unserious, and both sides lose if the final resolution lacks a source-anchored remedy.",
  ].join("\n");
}

export function buildDeterministicDivisionFallback(divisionId: DivisionId, input: DeterministicFallbackInput): DeterministicFallback {
  const anchors = input.sourceAnchors?.length ? input.sourceAnchors.join(" ") : "source anchors unavailable";
  const text = divisionId === "D7_debate_utility"
    ? [
        "D7 Debate Utility Arsenal - Deterministic fallback",
        `Fallback reason: ${input.reason}. This is a limited debate scaffold for ${input.agenda}, not thesis-grade model synthesis.`,
        `Treasury Bench: argue only from verified source anchors and concede gaps. ${anchors}`,
        `Opposition: challenge disclosure, proportionality, and federalism only where the record supports it. ${anchors}`,
        "POIs: ask which source proves the legal threshold, which ministry owns accountability, and which safeguard narrows overbreadth.",
        "Rebuttals: separate allegation from proof; distinguish legal holding from political inference; demand committee review where evidence is thin.",
        "Coalition Map: regional and cross-bench support depends on narrow safeguards.",
        "Red Lines: no uncited claims, no fake source usage, no normal success label.",
        "Amendment Language: require a ministry report and committee follow-up before implementation claims are treated as settled.",
      ].join("\n")
    : [
        `${divisionId} - Deterministic fallback`,
        `Fallback reason: ${input.reason}. This output is intentionally limited and should not be treated as thesis-grade synthesis.`,
        `Diagnosis: ${input.agenda} has an unresolved evidence or provider gap. ${anchors}`,
        "Prescription: use only verified anchors, disclose the limitation, and keep recommendations procedural.",
        "Warning: do not merge this fallback into a final archive as completed model synthesis.",
      ].join("\n");

  return { divisionId, isFallback: true, text };
}

export function synthesizeQualityDivisions(input: { agenda: string; cards: EvidenceCard[] }): QualitySynthesisResult {
  const outputs = new Map<DivisionId, string>();
  const quality = new Map<DivisionId, DivisionQualityResult>();
  const anchors = input.cards.slice(0, 6).map((card) => card.citation);

  for (const divisionId of DIVISION_IDS) {
    if (divisionId === "D7_debate_utility" || divisionId === "D11_strategic_insights") continue;
    const ordinal = divisionId.slice(0, divisionId.indexOf("_"));
    const body = [
      `${ordinal} ${titleFromDivisionId(divisionId)}`,
      `Purpose: connect ${input.agenda} to Indian parliamentary research without using UN framing.`,
      `Evidence: ${anchors.slice(0, 3).join(" ") || "source gap"}.`,
      "Runtime note: this deterministic synthesis scaffold is intentionally conservative until model-generated division text is available.",
    ].join("\n");
    outputs.set(divisionId, body);
    quality.set(divisionId, {
      passed: false,
      issues: ["Deterministic synthesis scaffold cannot pass as thesis-grade division output."],
      metrics: baseMetrics(body),
    });
  }

  const d7 = buildDebateUtilityDivision({ agenda: input.agenda, cards: input.cards });
  outputs.set("D7_debate_utility", d7);
  quality.set("D7_debate_utility", validateD7DebateUtility(d7));

  const d11 = buildStrategicInsightsDivision({ agenda: input.agenda, priorDivisions: outputs, sourceAnchors: anchors.slice(0, 2) });
  quality.set("D11_strategic_insights", validateD11StrategicInsights(d11, outputs));
  outputs.set("D11_strategic_insights", d11);

  return { outputs, quality };
}

function titleFromDivisionId(divisionId: DivisionId): string {
  return divisionId.replace(/^D\d+_/, "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractStrategicTheme(text: string): string {
  const normalized = text.toLowerCase();
  const themes = [
    /federalism/.test(normalized) ? "federalism pressure" : "",
    /proportional|rights|article\s+21/.test(normalized) ? "rights proportionality" : "",
    /treasury|opposition|poi|rebuttal/.test(normalized) ? "floor clash management" : "",
    /ministry|accountability|committee/.test(normalized) ? "committee accountability" : "",
    /source|citation|evidence/.test(normalized) ? "source discipline" : "",
  ].filter(Boolean);
  return themes.length ? themes.slice(0, 3).join(", ") : "the earlier division record";
}

function calculateRepetitionRatio(text: string, priorDivisions: Map<string, string>): number {
  const normalizedText = normalizeForRepetition(text);
  const totalWords = wordCount(text);
  if (!totalWords) return 0;

  let repeatedWords = 0;
  for (const prior of priorDivisions.values()) {
    const sentences = prior.split(/[.!?]\s+/).map((sentence) => normalizeForRepetition(sentence)).filter((sentence) => wordCount(sentence) >= 8);
    for (const sentence of sentences) {
      if (sentence && normalizedText.includes(sentence)) repeatedWords += wordCount(sentence);
    }
  }

  return Math.min(1, repeatedWords / totalWords);
}

function normalizeForRepetition(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
