import type { SourceBucketRequirement } from "../retrieval/source-buckets.js";
import { queryNeedsCurrentYearBias } from "../freshness/freshness-router.js";
import { classifyIndianParliamentaryTopic } from "../retrieval/query-planning/topic-classifier.js";

export type TopicType =
  | "indian_democratic_space"
  | "constitutional_law"
  | "indian_security_policy"
  | "indian_economic_policy"
  | "indian_federalism"
  | "indian_social_policy"
  | "indian_electoral_policy"
  | "foreign_policy_india"
  | "welfare_social_policy"
  | "education_policy"
  | "health_policy"
  | "labour_gig_economy"
  | "technology_data_ai_governance"
  | "environment_climate"
  | "agriculture_food_policy"
  | "judiciary_legal_reform"
  | "electoral_reform"
  | "generic_indian_parliament"
  | "unsupported_un_mun";

export type CommitteeSystem = "indian_mock_parliament" | "un_mun" | "unknown";

export type AgendaLens =
  | "democracy_indices"
  | "civil_liberties"
  | "dissent_repression"
  | "human_rights"
  | "judicial_responses"
  | "electoral_integrity"
  | "press_freedom"
  | "civil_society"
  | "internet_shutdowns"
  | "government_counter_narrative"
  | "academic_analysis"
  | "parliamentary_strategy"
  | "policy_pathways"
  | "federalism"
  | "constitutional_validity";

export interface AgendaContract {
  requestId: string;
  originalUserQuery: string;
  normalizedAgenda: string;
  committeeSystem: CommitteeSystem;
  topicType: TopicType;
  countryFocus: "India" | string | null;
  temporalScope: { startYear: number | null; endYear: number | null; explicit: boolean };
  requiredLenses: AgendaLens[];
  requiredEntities: string[];
  forbiddenDriftTerms: string[];
  mustNotClaimWithoutEvidence: string[];
  requiredSourceBuckets: SourceBucketRequirement[];
  outputDepth: "brief" | "detailed";
  evidenceStandard: "normal" | "advanced" | "thesis";
  debateMode: "indian_parliamentary" | "generic";
  minimumUniqueCitedSources: number;
  minimumEvidenceCardsPerModel: number;
}

export interface AgendaLockReport {
  passed: boolean;
  score: number;
  missingLenses: AgendaLens[];
  missingEntities: string[];
  detectedDriftTerms: string[];
  indiaFocusScore: number;
  temporalScopeScore: number;
  committeeSystemScore: number;
  actionRequired: "none" | "repair";
}

export interface BuildAgendaContractInput {
  requestId?: string;
  originalUserQuery: string;
  outputDepth?: AgendaContract["outputDepth"];
}

const DEMOCRACY_ENTITIES = [
  "India",
  "Freedom House",
  "V-Dem",
  "EIU Democracy Index",
  "International IDEA",
  "Global State of Democracy",
  "UAPA",
  "FCRA",
  "internet shutdowns",
  "HRW",
  "Amnesty",
  "CIVICUS",
  "Supreme Court of India",
  "Election Commission of India",
  "EVM",
  "VVPAT",
  "World Press Freedom Index",
  "RSF",
  "Ministry of Home Affairs",
  "EPW",
  "The Hindu",
  "Indian Express",
];

const DEMOCRACY_LENSES: AgendaLens[] = [
  "democracy_indices",
  "civil_liberties",
  "dissent_repression",
  "human_rights",
  "judicial_responses",
  "electoral_integrity",
  "press_freedom",
  "civil_society",
  "internet_shutdowns",
  "government_counter_narrative",
  "academic_analysis",
  "parliamentary_strategy",
  "constitutional_validity",
];

export const DEFAULT_FORBIDDEN_DRIFT_TERMS = [
  "artificial intelligence",
  "AI-generated",
  "generative AI",
  "deepfakes",
  "algorithmic bias",
  "AI surveillance",
  "AI governance",
  "AI tools",
  "UN Security Council",
  "member states",
  "international community must",
  "country bloc",
  "UN resolution",
];

export function buildAgendaContract(input: BuildAgendaContractInput): AgendaContract {
  const originalUserQuery = input.originalUserQuery.trim();
  const normalizedAgenda = originalUserQuery.replace(/\s+/g, " ").trim();
  const lower = normalizedAgenda.toLowerCase();
  const isUnExplicit = /\b(unsc|united nations|security council|general assembly|ecosoc)\b/i.test(normalizedAgenda);
  const isIndiaDemocracy = /\bindia'?s?\b|\bindian\b/i.test(normalizedAgenda)
    && /\b(democratic space|democracy|backsliding|civil liberties|uapa|fcra|freedom house|v-dem|press freedom|civicus)\b/i.test(normalizedAgenda);
  const temporalScope = inferTemporalScope(normalizedAgenda);

  if (isIndiaDemocracy && !isUnExplicit) {
    return {
      requestId: input.requestId ?? makeRequestId(),
      originalUserQuery,
      normalizedAgenda,
      committeeSystem: "indian_mock_parliament",
      topicType: "indian_democratic_space",
      countryFocus: "India",
      temporalScope,
      requiredLenses: DEMOCRACY_LENSES,
      requiredEntities: DEMOCRACY_ENTITIES,
      forbiddenDriftTerms: DEFAULT_FORBIDDEN_DRIFT_TERMS,
      mustNotClaimWithoutEvidence: [
        "fraud happened",
        "election was stolen",
        "EVMs were manipulated",
        "India is authoritarian",
        "specific UAPA/FCRA totals",
        "specific internet shutdown totals",
        "specific press freedom rank",
        "specific Supreme Court holding",
      ],
      requiredSourceBuckets: [
        "democracy_index",
        "government_official",
        "court_legal",
        "human_rights_watchdog",
        "civic_space",
        "press_freedom",
        "digital_rights",
        "electoral_integrity",
        "academic_research",
        "indian_major_media",
        "comparative_democracy",
        "parliamentary_records",
      ].map((bucketId) => ({ bucketId, required: true })),
      outputDepth: input.outputDepth ?? "detailed",
      evidenceStandard: "thesis",
      debateMode: "indian_parliamentary",
      minimumUniqueCitedSources: 30,
      minimumEvidenceCardsPerModel: 30,
    };
  }

  return {
    requestId: input.requestId ?? makeRequestId(),
    originalUserQuery,
    normalizedAgenda,
    committeeSystem: isUnExplicit ? "un_mun" : "indian_mock_parliament",
    topicType: isUnExplicit ? "unsupported_un_mun" : classifyGenericIndianTopic(lower),
    countryFocus: /\bindia'?s?\b|\bindian\b/i.test(normalizedAgenda) ? "India" : null,
    temporalScope,
    requiredLenses: ["parliamentary_strategy", "policy_pathways"],
    requiredEntities: /\bindia'?s?\b|\bindian\b/i.test(normalizedAgenda) ? ["India"] : [],
    forbiddenDriftTerms: isUnExplicit ? [] : forbiddenDriftTermsForAgenda(normalizedAgenda),
    mustNotClaimWithoutEvidence: ["statistics", "legal holding", "electoral fraud allegation"],
    requiredSourceBuckets: [],
    outputDepth: input.outputDepth ?? "detailed",
    evidenceStandard: "advanced",
    debateMode: isUnExplicit ? "generic" : "indian_parliamentary",
    minimumUniqueCitedSources: 10,
    minimumEvidenceCardsPerModel: 10,
  };
}

export function assertAgendaLock(text: string, contract: AgendaContract): AgendaLockReport {
  const lower = text.toLowerCase();
  const missingEntities = contract.requiredEntities.filter((entity) => !containsLoose(lower, entity));
  const missingLenses = contract.requiredLenses.filter((lens) => !lensAppears(lower, lens));
  const detectedDriftTerms = contract.forbiddenDriftTerms.filter((term) => containsLoose(lower, term));
  const indiaFocusScore = contract.countryFocus === "India" ? scorePresence(lower, ["india", "indian", "supreme court", "election commission"]) : 50;
  const temporalScopeScore = contract.temporalScope.explicit
    ? scorePresence(lower, [String(contract.temporalScope.startYear), String(contract.temporalScope.endYear)])
    : 100;
  const committeeSystemScore = contract.debateMode === "indian_parliamentary"
    ? scorePresence(lower, ["treasury bench", "opposition", "parliament", "lok sabha", "rajya sabha", "mock parliament", "poi"])
    : 70;
  const driftPenalty = detectedDriftTerms.length * 12;
  const entityPenalty = Math.min(35, missingEntities.length * 2);
  const lensPenalty = Math.min(25, missingLenses.length * 3);
  const score = Math.max(0, Math.round((indiaFocusScore * 0.3 + temporalScopeScore * 0.2 + committeeSystemScore * 0.2 + 30) - driftPenalty - entityPenalty - lensPenalty));
  const passed = score >= 75 && detectedDriftTerms.length === 0 && indiaFocusScore >= 40;
  return {
    passed,
    score,
    missingLenses,
    missingEntities,
    detectedDriftTerms,
    indiaFocusScore,
    temporalScopeScore,
    committeeSystemScore,
    actionRequired: passed ? "none" : "repair",
  };
}

export async function repairAgendaDrift(text: string, contract: AgendaContract): Promise<string> {
  let repaired = text;
  for (const term of contract.forbiddenDriftTerms) {
    repaired = repaired.replace(new RegExp(escapeRegExp(term), "gi"), "[removed drift]");
  }
  if (contract.countryFocus === "India" && !/\bIndia\b/i.test(repaired)) {
    repaired = `India-specific parliamentary framing required.\n\n${repaired}`;
  }
  return repaired;
}

function inferTemporalScope(text: string): AgendaContract["temporalScope"] {
  const range = text.match(/\b(20\d{2})\s*(?:-|–|to|through)\s*(20\d{2})\b/i);
  if (range) {
    return { startYear: Number(range[1]), endYear: Number(range[2]), explicit: true };
  }
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  if (years.length > 0) {
    return { startYear: Math.min(...years), endYear: Math.max(...years), explicit: true };
  }
  if (queryNeedsCurrentYearBias(text)) {
    const currentYear = new Date().getFullYear();
    return { startYear: currentYear, endYear: currentYear, explicit: false };
  }
  return { startYear: null, endYear: null, explicit: false };
}

function classifyGenericIndianTopic(lower: string): TopicType {
  return classifyIndianParliamentaryTopic(lower).topicType as TopicType;
}

function forbiddenDriftTermsForAgenda(normalizedAgenda: string): string[] {
  const lower = normalizedAgenda.toLowerCase();
  const allowsAiElectionContent = /\b(deepfakes?|deep-fakes?|synthetic\s+political\s+content|ai-generated|online\s+political\s+advertising|platform\s+transparency)\b/i.test(normalizedAgenda);
  return DEFAULT_FORBIDDEN_DRIFT_TERMS.filter((term) => {
    if (allowsAiElectionContent && /^(artificial intelligence|AI-generated|generative AI|deepfakes)$/i.test(term)) return false;
    return !lower.includes(term.toLowerCase());
  });
}

function lensAppears(lower: string, lens: AgendaLens): boolean {
  const terms: Record<AgendaLens, string[]> = {
    democracy_indices: ["freedom house", "v-dem", "eiu", "index", "democracy"],
    civil_liberties: ["civil liberties", "rights", "freedom"],
    dissent_repression: ["dissent", "uapa", "sedition", "repression"],
    human_rights: ["human rights", "hrw", "amnesty"],
    judicial_responses: ["supreme court", "court", "judicial"],
    electoral_integrity: ["election", "eci", "evm", "vvpat"],
    press_freedom: ["press", "journalist", "rsf"],
    civil_society: ["civicus", "civil society", "ngo", "fcra"],
    internet_shutdowns: ["internet shutdown"],
    government_counter_narrative: ["government", "mha", "eci", "official"],
    academic_analysis: ["epw", "academic", "journal"],
    parliamentary_strategy: ["parliament", "treasury", "opposition", "poi"],
    policy_pathways: ["policy", "recommendation", "safeguard"],
    federalism: ["federal", "state"],
    constitutional_validity: ["constitutional", "article", "supreme court"],
  };
  return terms[lens].some((term) => lower.includes(term));
}

function containsLoose(lower: string, term: string): boolean {
  const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
  return lower.includes(normalized) || lower.includes(normalized.replace(/-/g, " "));
}

function scorePresence(lower: string, terms: Array<string | null>): number {
  const valid = terms.filter((term): term is string => Boolean(term && term !== "null"));
  if (valid.length === 0) return 100;
  const hits = valid.filter((term) => lower.includes(term.toLowerCase())).length;
  return Math.round((hits / valid.length) * 100);
}

function makeRequestId(): string {
  return `agenda_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
