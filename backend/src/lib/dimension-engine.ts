import type {
  AgendaClass,
  CommitteeType,
  DimensionClass,
  DimensionEngineOutput,
  DimensionName,
  DimensionScore,
  StructuralDNA,
} from "./types.js";

export const DIMENSION_KEYWORDS: Record<DimensionName, string[]> = {
  political: ["party", "elections", "coalition", "parliamentary majority", "floor management", "ruling party", "opposition", "bjp", "congress", "aap", "tmc", "alliance", "seat", "vote share"],
  constitutional: ["fundamental rights", "article", "amendment", "basic structure", "judicial review", "constitution", "preamble", "directive principles", "constitutional validity", "ultra vires", "unconstitutional"],
  economic: ["gdp", "fiscal", "trade", "employment", "industry", "revenue", "subsidy", "budget", "inflation", "gst", "rbi", "monetary", "niti aayog", "crore", "lakh"],
  security: ["border", "terrorism", "insurgency", "defense", "defence", "intelligence", "internal security", "armed forces", "afspa", "nsa", "uapa", "ceasefire", "military", "standoff"],
  human_rights: ["dignity", "minorities", "displacement", "detention", "violence", "protection", "rights", "nhrc", "torture", "custodial", "lynching", "minority", "privacy", "liberty"],
  judiciary: ["courts", "sc ruling", "hc ruling", "contempt", "pil", "interpretation", "enforcement", "supreme court", "high court", "bench", "writ", "judgment", "judgement"],
  diplomatic: ["bilateral", "multilateral", "treaty", "foreign policy", "sanctions", "mea", "ambassador", "diplomatic", "saarc", "g20", "brics"],
  technological: ["data", "ai", "surveillance", "digital infrastructure", "cyber", "space", "aadhaar", "dpdp", "it act", "internet", "algorithm", "biometric"],
  electoral: ["delimitation", "voter rolls", "evm", "campaign finance", "model code", "election commission", "vvpat", "electoral bond"],
  media_information: ["press freedom", "misinformation", "narrative control", "censorship", "propaganda", "journalist", "media ownership", "rsf", "cpj"],
  governance: ["bureaucracy", "implementation", "delivery", "accountability", "transparency", "cag", "audit", "scheme", "performance", "corruption"],
  federalism: ["centre-state", "center-state", "concurrent list", "governor", "state autonomy", "fiscal devolution", "article 356", "union list", "state list", "gst council"],
  social_stability: ["communal harmony", "caste", "protest", "mob violence", "social cohesion", "riots", "communal", "dalit", "obc", "unrest"],
  public_sentiment: ["polling data", "street opinion", "trust deficit", "approval", "outrage", "public opinion", "survey"],
  international_relations: ["global pressure", "un", "treaties", "foreign interference", "diaspora", "unsc", "general assembly", "icj"],
  strategic_affairs: ["geopolitical positioning", "alliance architecture", "power projection", "strategic autonomy", "quad", "indo-pacific", "nsg", "strategic balance"],
};

// Synonym expansion for ambiguous high-value terms
const DIMENSION_SYNONYMS: Record<DimensionName, string[]> = {
  constitutional: ["fundamental right", "basic structure", "writ", "petition", "preamble",
    "constitutional validity", "ultra vires", "judicial review", "article",
    "amendment", "schedule", "unconstitutional", "directive principle",
    "separation of powers", "rule of law", "due process", "natural justice",
    "president's rule", "emergency provision", "governor", "ordinance"],
  federalism: ["centre-state", "concurrent list", "union list", "state list",
    "fiscal federalism", "cooperative federalism", "asymmetric federalism",
    "finance commission", "gst council", "article 356", "article 370",
    "vidhan sabha", "state legislature", "state government",
    "division of powers", "interstate council", "zonal council"],
  social_stability: ["communal", "caste", "riot", "lynching", "mob", "unrest", "protest",
    "agitation", "bandh", "hartaal", "strike", "demonstration",
    "social tension", "polarisation", "polarization", "identity politics",
    "hate crime", "ethnic", "religious violence", "cow vigilante"],
  judiciary: ["supreme court", "high court", "bench", "judgment", "judgement", "writ",
    "pil", "contempt", "judicial review", "interpretation", "precedent",
    "obiter dicta", "ratio decidendi", "stay order", "interim order"],
  economic: ["gdp growth", "fiscal deficit", "inflation rate", "unemployment",
    "gst revenue", "budget allocation", "subsidy burden", "trade deficit",
    "monetary policy", "repo rate", "crore rupees", "lakh crore"],
  security: ["border tension", "ceasefire violation", "terrorist attack", "insurgency",
    "internal security", "armed forces", "afspa", "nsa", "uapa",
    "intelligence failure", "military standoff", "surgical strike"],
  political: ["coalition government", "floor test", "no confidence", "parliamentary majority",
    "opposition unity", "bjp", "congress", "regional party", "alliance",
    "vote share", "seat tally", "defection", "anti-defection law"],
  human_rights: ["fundamental rights", "minority rights", "civil liberties", "custodial death",
    "police brutality", "lynching", "mob violence", "detention without trial",
    "nhrc", "torture", "dignity", "privacy rights"],
  diplomatic: ["bilateral relations", "foreign policy", "diplomatic crisis", "sanctions",
    "mea statement", "ambassador", "treaty", "multilateral forum",
    "saarc", "g20", "brics", "quad"],
  technological: ["data protection", "privacy law", "aadhaar", "surveillance",
    "cyber security", "digital infrastructure", "ai regulation",
    "it act", "internet shutdown", "biometric data"],
  electoral: ["election commission", "evm", "vvpat", "voter list", "delimitation",
    "model code of conduct", "campaign finance", "electoral bond",
    "free and fair election", "voter turnout"],
  media_information: ["press freedom", "journalist safety", "censorship", "propaganda",
    "misinformation", "fake news", "media ownership", "rsf ranking",
    "cpj report", "article 19", "sedition law"],
  governance: ["bureaucratic delay", "implementation gap", "cag audit", "scheme performance",
    "accountability", "transparency", "corruption", "red tape",
    "delivery mechanism", "last mile"],
  public_sentiment: ["public opinion", "polling data", "approval rating", "trust deficit",
    "street protest", "outrage", "survey", "sentiment analysis"],
  international_relations: ["un resolution", "unsc", "general assembly", "icj ruling",
    "treaty obligation", "global pressure", "diaspora", "foreign interference",
    "multilateral", "bilateral"],
  strategic_affairs: ["geopolitical", "strategic autonomy", "power projection", "quad",
    "indo-pacific", "alliance architecture", "strategic balance",
    "nsg", "mtcr", "strategic partnership"],
};

const COMMITTEE_DIMENSION_BOOSTS: Record<CommitteeType, Partial<Record<DimensionName, number>>> = {
  lok_sabha: { political: 30, governance: 25, constitutional: 20, federalism: 15 },
  rajya_sabha: { political: 25, constitutional: 30, federalism: 25, governance: 15 },
  aippm: { federalism: 40, political: 30, economic: 20, constitutional: 20 },
  national_security: { security: 40, strategic_affairs: 30, diplomatic: 20 },
  constitutional: { constitutional: 40, judiciary: 35, human_rights: 25, federalism: 15 },
  crisis: { security: 35, social_stability: 30, media_information: 20, diplomatic: 15 },
  public_policy: { economic: 30, governance: 30, technological: 20, social_stability: 15 },
  human_rights: { human_rights: 40, judiciary: 30, constitutional: 25, media_information: 15 },
  economic: { economic: 40, governance: 25, federalism: 20, political: 15 },
  foreign_affairs: { diplomatic: 40, international_relations: 35, strategic_affairs: 25, security: 20, political: 15 },
  youth_parliament: { political: 25, governance: 20, constitutional: 20, public_sentiment: 15 },
  general: { political: 15, governance: 15, constitutional: 10 },
};

const CONFLICT_SIGNALS: { pattern: RegExp; signal: string; dimensionBoost: DimensionName }[] = [
  { pattern: /\b(contested|challenged|unconstitutional|struck down|challenge|litigation|petition|pil)\b/i, signal: "ongoing_constitutional_challenge", dimensionBoost: "constitutional" },
  { pattern: /\b(bilateral tension|standoff|diplomatic crisis|expel|ambassador recalled|sanctions)\b/i, signal: "active_bilateral_tension", dimensionBoost: "diplomatic" },
  { pattern: /\b(communal|riots|violence|unrest|protest|agitation|bandh|hartaal)\b/i, signal: "social_instability_signal", dimensionBoost: "social_stability" },
  { pattern: /\b(deadlock|impasse|failed|collapsed|breakdown|no consensus|walkout)\b/i, signal: "institutional_deadlock", dimensionBoost: "political" },
  { pattern: /\b(fake|misinformation|disinformation|narrative|propaganda|bot|troll)\b/i, signal: "information_warfare", dimensionBoost: "media_information" },
];

export function runDimensionEngine(
  agendaText: string,
  committeeType: CommitteeType = "general",
  userSystemPrompt = "",
): DimensionEngineOutput {
  const text = `${agendaText} ${userSystemPrompt}`.toLowerCase();
  const rawScores = {} as Record<DimensionName, number>;
  const boostedScores = {} as Record<DimensionName, number>;
  const triggers = {} as Record<DimensionName, string[]>;

  for (const [dim, keywords] of Object.entries(DIMENSION_KEYWORDS) as [DimensionName, string[]][]) {
    const synonyms = DIMENSION_SYNONYMS[dim] ?? [];
    const allTerms = [...keywords, ...synonyms];
    
    // Keywords worth 10 points, synonyms worth 7 points
    const keywordMatches = keywords.filter((kw) => text.includes(kw.toLowerCase()));
    const synonymMatches = synonyms.filter((s) => text.includes(s.toLowerCase()));
    
    const keywordScore = keywordMatches.length * 10;
    const synonymScore = synonymMatches.length * 7;
    
    rawScores[dim] = keywordScore + synonymScore;
    boostedScores[dim] = rawScores[dim];
    triggers[dim] = [...keywordMatches, ...synonymMatches.slice(0, 3)]; // Include top 3 synonym matches
  }

  const boosts = COMMITTEE_DIMENSION_BOOSTS[committeeType] ?? {};
  for (const [dim, boost] of Object.entries(boosts) as [DimensionName, number][]) {
    boostedScores[dim] = (boostedScores[dim] ?? 0) + boost;
  }

  const conflictSignals: string[] = [];
  for (const { pattern, signal, dimensionBoost } of CONFLICT_SIGNALS) {
    if (pattern.test(agendaText)) {
      conflictSignals.push(signal);
      boostedScores[dimensionBoost] = (boostedScores[dimensionBoost] ?? 0) + 25;
    }
  }

  const MIN_DIMENSION_CONFIDENCE = 15;
  const sorted = (Object.entries(boostedScores) as [DimensionName, number][])
    .filter(([, score]) => score >= MIN_DIMENSION_CONFIDENCE)
    .sort(([, a], [, b]) => b - a);

  const toScore = (priority: DimensionScore["priority"]) => ([name, boostedScore]: [DimensionName, number]): DimensionScore => ({
    name,
    class: getDimensionClass(name),
    rawScore: rawScores[name] ?? 0,
    boostedScore,
    priority,
    triggerKeywords: triggers[name] ?? [],
  });

  const primaryCount = detectPrimaryThreshold(sorted);
  const primaryDimensions = sorted.slice(0, primaryCount).map(toScore("primary"));
  const secondaryDimensions = sorted.slice(primaryCount, primaryCount + 4).map(toScore("secondary"));
  const backgroundDimensions = sorted.slice(primaryCount + 4).map(toScore("background"));
  const agendaClass = detectAgendaClass(primaryDimensions);
  const structuralDNA = buildStructuralDNA(agendaClass, primaryDimensions, secondaryDimensions, committeeType);

  return {
    agendaText,
    committeeType,
    primaryDimensions,
    secondaryDimensions,
    backgroundDimensions,
    agendaClass,
    conflictSignals,
    structuralDNA,
  };
}

export function detectPrimaryThreshold(sorted: [DimensionName, number][]): number {
  if (sorted.length <= 2) return sorted.length;

  let maxDrop = 0;
  let elbowIndex = 0;
  for (let i = 2; i < Math.min(sorted.length - 1, 8); i++) {
    const drop = sorted[i - 1][1] - sorted[i][1];
    const relativeDrop = drop / Math.max(sorted[0][1], 1);
    if (relativeDrop > maxDrop && relativeDrop > 0.30) {
      maxDrop = relativeDrop;
      elbowIndex = i;
    }
  }

  if (elbowIndex === 0) {
    const totalScore = sorted.reduce((sum, [, score]) => sum + score, 0);
    let cumulative = 0;
    for (let i = 0; i < sorted.length; i++) {
      cumulative += sorted[i][1];
      if (totalScore > 0 && cumulative / totalScore >= 0.65) {
        elbowIndex = Math.min(i + 1, 5);
        break;
      }
    }
    if (elbowIndex === 0) elbowIndex = Math.min(4, sorted.length);
  }

  return Math.min(Math.max(elbowIndex, 2), 6);
}

export function getDimensionClass(name: DimensionName): DimensionClass {
  const core: DimensionName[] = ["political", "constitutional", "economic", "security", "human_rights"];
  const secondary: DimensionName[] = ["judiciary", "diplomatic", "technological", "electoral", "media_information", "governance", "federalism"];
  return core.includes(name) ? "core" : secondary.includes(name) ? "secondary" : "tertiary";
}

export function detectAgendaClass(primaryDimensions: DimensionScore[]): AgendaClass {
  const names = primaryDimensions.map((d) => d.name);
  if (names.includes("constitutional") && names.includes("human_rights")) return "rights_constitutional";
  if (names.includes("security") && names.includes("strategic_affairs")) return "security_internal";
  if (names.includes("social_stability") && names.includes("security")) return "crisis";
  if (names.includes("federalism") || (names.includes("economic") && names.includes("governance"))) return "federal_centrestate";
  if (names.includes("economic") && !names.includes("security")) return "economic_fiscal";
  if (names.includes("diplomatic") || names.includes("international_relations")) return "diplomatic_foreign";
  if (names.includes("electoral")) return "electoral_democratic";
  return "governance_policy";
}

export function buildTokenBudgetMap(engine: Pick<DimensionEngineOutput, "primaryDimensions" | "secondaryDimensions">, totalBudget = 8192): Map<string, number> {
  const budget = new Map<string, number>();
  const fixedFraction = {
    debate_utility: 0.15,
    strategic_insights: 0.10,
    core_brief: 0.08,
  } as const;
  for (const [key, fraction] of Object.entries(fixedFraction)) {
    budget.set(key, Math.floor(totalBudget * fraction));
  }

  const fixedTotal = Object.values(fixedFraction).reduce((sum, fraction) => sum + fraction, 0);
  const flexibleBudget = Math.floor(totalBudget * (1 - fixedTotal));
  const primaryTotal = Math.max(1, engine.primaryDimensions.reduce((sum, d) => sum + d.boostedScore, 0));
  for (const dim of engine.primaryDimensions) {
    const tokens = Math.floor(flexibleBudget * 0.5 * (dim.boostedScore / primaryTotal));
    budget.set(`analytical_${dim.name}`, tokens);
  }

  const perSecondary = Math.floor((flexibleBudget * 0.3) / Math.max(engine.secondaryDimensions.length, 1));
  for (const dim of engine.secondaryDimensions) {
    budget.set(`analytical_${dim.name}_secondary`, perSecondary);
  }

  const remainingDivisions = ["stakeholder_mapping", "conflict_mapping", "narrative_analysis", "evidence_verification", "policy_pathways", "predictive_analysis", "resolution_support"];
  const perRemaining = Math.floor((flexibleBudget * 0.2) / remainingDivisions.length);
  for (const div of remainingDivisions) budget.set(div, perRemaining);
  return budget;
}

function buildStructuralDNA(
  agendaClass: AgendaClass,
  primaryDimensions: DimensionScore[],
  secondaryDimensions: DimensionScore[],
  committeeType: CommitteeType,
): StructuralDNA {
  const tokenBudget = buildTokenBudgetMap({ primaryDimensions, secondaryDimensions });
  const leadDivisionByClass: Record<AgendaClass, string> = {
    rights_constitutional: "analytical_dimensions",
    economic_fiscal: "evidence_verification",
    security_internal: "conflict_mapping",
    federal_centrestate: "stakeholder_mapping",
    crisis: "predictive_analysis",
    governance_policy: "core_brief",
    diplomatic_foreign: "stakeholder_mapping",
    electoral_democratic: "narrative_analysis",
  };
  const evidencePriorityByClass: Record<AgendaClass, StructuralDNA["evidencePriority"]> = {
    rights_constitutional: ["tier1", "tier4", "tier2", "tier5", "tier3"],
    economic_fiscal: ["tier3", "tier2", "tier4", "tier1", "tier5"],
    security_internal: ["tier2", "tier5", "tier4", "tier1", "tier3"],
    federal_centrestate: ["tier1", "tier2", "tier3", "tier4", "tier5"],
    crisis: ["tier2", "tier4", "tier5", "tier1", "tier3"],
    governance_policy: ["tier2", "tier3", "tier1", "tier4", "tier5"],
    diplomatic_foreign: ["tier5", "tier2", "tier4", "tier1", "tier3"],
    electoral_democratic: ["tier1", "tier2", "tier4", "tier3", "tier5"],
  };
  const debateRegister: StructuralDNA["debateRegister"] =
    committeeType === "foreign_affairs" ? "diplomatic"
      : committeeType === "aippm" ? "combative"
        : (agendaClass === "security_internal" || agendaClass === "crisis") ? "combative"
          : agendaClass === "economic_fiscal" ? "technical"
            : "deliberative";

  return {
    leadDivision: leadDivisionByClass[agendaClass],
    elevatedDivisions: ["core_brief", "analytical_dimensions", "debate_utility", "strategic_insights"],
    compressedDivisions: primaryDimensions.length <= 3 ? ["predictive_analysis"] : [],
    evidencePriority: evidencePriorityByClass[agendaClass],
    debateRegister,
    tokenBudget,
  };
}
