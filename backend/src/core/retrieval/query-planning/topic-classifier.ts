export type IndianTopicType =
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
  | "generic_indian_parliament";

export interface TopicClassification {
  topicType: IndianTopicType;
  confidence: number;
  matchedTerms: string[];
  competing: Array<{ topicType: IndianTopicType; score: number }>;
  lowConfidence?: boolean;
}

type TopicRule = {
  topicType: IndianTopicType;
  include: RegExp[];
  exclude?: RegExp[];
  weight?: number;
};

const RULES: TopicRule[] = [
  rule("indian_democratic_space", [/democratic space|democratic backsliding|civil liberties|freedom house|v-?dem|press freedom|civicus|uapa|fcra/i], 3),
  rule("constitutional_law", [/constitution|article\s+\d+|fundamental rights|basic structure|constitutional validity|supreme court doctrine/i], 2.8),
  rule("indian_federalism", [/federalism|centre-?state|center-?state|governor|article\s+356|interstate|state autonomy/i], 2.7),
  rule("technology_data_ai_governance", [/dpdp|data protection|privacy|digital personal data|ai governance|algorithm|digital governance|platform regulation|ondc|semiconductor|electronics|cybersecurity/i], 2.6),
  rule("labour_gig_economy", [/gig worker|platform worker|labou?r code|social security code|minimum wage|trade union|worker welfare/i], 2.6),
  rule("health_policy", [/health|mohfw|public health|ayushman|nutrition|maternal|vaccine|hospital|medical/i], 2.4),
  rule("education_policy", [/education|school|university|ugc|neet|new education policy|learning outcome|teacher/i], 2.4),
  rule("agriculture_food_policy", [/\bfood security\b|\bpds\b|\bmsp\b|\bagriculture\b|\bfarmer\b|\bcrop\b|\bmandi\b|\bfertili[sz]er\b|\bfood subsidy\b|\bnutrition\b|\bration\b/i], 3),
  rule("environment_climate", [/climate|environment|air pollution|water security|river|forest|biodiversity|emission|heatwave|disaster/i], 2.6),
  rule("indian_economic_policy", [/econom|budget|gst|rbi|inflation|industrial policy|pli|manufacturing|trade|commerce|msme|startup|market|fiscal/i], 2.5),
  rule("welfare_social_policy", [/welfare|reservation|caste|gender|minority|social justice|poverty|scheme|benefit transfer|pension/i], 2.4),
  rule("judiciary_legal_reform", [/judicial reform|court reform|tribunal|pendency|collegium|criminal law reform|bns|bnss|bsa|legal reform/i], 2.5),
  rule("electoral_reform", [/electoral reform|campaign finance|political funding|electoral bonds|delimitation|anti-defection|simultaneous election/i], 2.7),
  rule("indian_electoral_policy", [/election|eci|evm|vvpat|voter|model code|poll/i], 2.4),
  rule("foreign_policy_india", [/foreign policy|mea|india-?china|lac|line of actual control|geopolitical|neighbourhood first|diplomacy|border talks/i], 2.3, [/industrial policy|manufacturing|pli|semiconductor|food security|water security/i]),
  rule("indian_security_policy", [/defen[cs]e|military|terror|insurgenc|afspa|national security|public order|border security|mha|naxal|internal security/i], 2.5, [/food security|water security|energy security|health security|social security/i]),
];

export function classifyIndianParliamentaryTopic(input: string): TopicClassification {
  const text = input.replace(/\s+/g, " ").trim();
  const securityMatchedTerms = prioritySecurityTerms(text);
  if (securityMatchedTerms.length > 0) {
    return {
      topicType: "indian_security_policy",
      confidence: 0.86,
      matchedTerms: securityMatchedTerms,
      competing: scoreRules(text).slice(0, 3).filter((item) => item.score > 0).map((item) => ({ topicType: item.topicType, score: item.score })),
    };
  }

  const scores = scoreRules(text);
  const best = scores[0];
  if (!best || best.score <= 0) {
    return { topicType: "generic_indian_parliament", confidence: 0.35, matchedTerms: [], competing: [], lowConfidence: true };
  }
  const total = scores.reduce((sum, item) => sum + item.score, 0);
  const confidence = Math.max(0.5, Math.min(0.98, best.score / Math.max(total, best.score)));
  return {
    topicType: best.topicType,
    confidence,
    matchedTerms: best.matchedTerms,
    competing: scores.slice(1, 4).filter((item) => item.score > 0).map((item) => ({ topicType: item.topicType, score: item.score })),
    lowConfidence: confidence < 0.55,
  };
}

function scoreRules(text: string): Array<{ topicType: IndianTopicType; score: number; matchedTerms: string[] }> {
  const scores = RULES.map((item) => {
    if (item.exclude?.some((pattern) => pattern.test(text))) {
      return { topicType: item.topicType, score: 0, matchedTerms: [] };
    }
    const matchedTerms = item.include
      .filter((pattern) => pattern.test(text))
      .map((pattern) => pattern.source.replace(/\\b|\(|\)|\?:|\|/g, " ").replace(/\\/g, "").slice(0, 40).trim());
    const score = matchedTerms.length * (item.weight ?? 1);
    return { topicType: item.topicType, score, matchedTerms };
  }).sort((a, b) => b.score - a.score);
  return scores;
}

function prioritySecurityTerms(text: string): string[] {
  if (/food security|water security|energy security|health security|social security/i.test(text)) {
    return [];
  }
  return [
    /\bafspa\b/i,
    /\bnational security\b/i,
    /\bpublic order\b/i,
    /\binternal security\b/i,
    /\binsurgenc\w*\b/i,
    /\bterror\w*\b/i,
    /\bnaxal\w*\b/i,
  ]
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source.replace(/\\b|\\w\*|\(|\)|\?:|\|/g, " ").replace(/\\/g, "").trim());
}

function rule(topicType: IndianTopicType, include: RegExp[], weight = 1, exclude?: RegExp[]): TopicRule {
  return { topicType, include, weight, exclude };
}
