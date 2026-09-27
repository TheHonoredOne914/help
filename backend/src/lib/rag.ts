import { LRUCache } from "lru-cache";
import type { CommitteeType, DimensionEngineOutput, DimensionName, DimensionScore, EnrichedResult } from "./types.js";
import { logger } from "./logger.js";

const conflictCache = new LRUCache<string, string[]>({ max: 200, ttl: 1000 * 60 * 5 });

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "ref_src"].forEach((k) =>
      u.searchParams.delete(k)
    );
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}


// â”€â”€â”€ Source quality tiering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SOURCE_TIERS: [RegExp, number][] = [
  [/\b(un\.org|undp\.org|unicef\.org|unhcr\.org|who\.int|iaea\.org|wto\.org)\b/i, 1.0],
  [/\b(mea\.gov\.in|pib\.gov\.in|pmoindia\.gov\.in|meaindia\.in)\b/i, 1.0],
  [/\b(icj-cij\.org|icc-cpi\.int|opcw\.org|ctbto\.org)\b/i, 1.0],
  [/\b(worldbank\.org|imf\.org|weforum\.org|oecd\.org)\b/i, 0.85],
  [/\b(thehindu\.com|indianexpress\.com|livemint\.com|business-standard\.com|ndtv\.com|scroll\.in|thewire\.in)\b/i, 0.7],
  [/\b(reuters\.com|apnews\.com|bbc\.(com|co\.uk)|aljazeera\.com|foreignpolicy\.com|cfr\.org)\b/i, 0.7],
  [/\b(jstor\.org|scholar\.google|researchgate\.net|ssrn\.com|brookings\.edu|chathamhouse\.org|sipri\.org)\b/i, 0.8],
  [/\bwikipedia\.org\b/i, 0.3],
  [/\b(quora\.com|reddit\.com|pinterest\.com|instagram\.com|tiktok\.com|youtube\.com)\b/i, -0.3],
  [/\b(buzzfeed|clickbait|toplist|listicle)\b/i, -0.3],
];

export function getSourceTierBonus(url: string): number {
  for (const [pattern, bonus] of SOURCE_TIERS) {
    if (pattern.test(url)) return bonus;
  }
  return 0;
}

export function scoreRelevance(query: string, title: string, content: string, url = ""): number {
  const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTokens.length === 0) return 0.1;
  const text = (title + " " + content).toLowerCase();
  const termFrequency = queryTokens.filter((t) => text.includes(t)).length / queryTokens.length;
  const freshness = freshnessScore(content, new Date().getFullYear());
  const lengthBonus = Math.min(content.length / 4000, 1) * 0.15;
  const titleBonus = (queryTokens.filter((t) => title.toLowerCase().includes(t)).length / queryTokens.length) * 0.2;
  const tierBonus = getSourceTierBonus(url);
  const isMunQuery = /\b(UN|UNSC|UNGA|HRC|resolution|committee|delegate|bloc|India|MEA|treaty|sanction)\b/i.test(query);
  const munBonus = isMunQuery && tierBonus >= 0.7 ? 0.15 : 0;
  return Math.min(1.5, termFrequency + freshness + lengthBonus + titleBonus + tierBonus + munBonus);
}

function freshnessScore(content: string, currentYear: number): number {
  for (let offset = 0; offset <= 3; offset++) {
    const year = currentYear - offset;
    if (new RegExp(`\\b${year}\\b`).test(content)) {
      return Math.max(0, 0.30 - offset * 0.08);
    }
  }
  return 0;
}


// â”€â”€â”€ Source conflict detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function detectSourceConflicts(results: EnrichedResult[]): string[] {
  const key = results.slice(0, 5).map((result) => canonicalizeUrl(result.url)).join("|");
  const cached = conflictCache.get(key);
  if (cached) return cached;
  const conflicts: string[] = [];
  const numericPattern = /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(billion|million|thousand|%|percent|countries|members|votes)\b/gi;
  const topResults = results.slice(0, 10).filter((r) => r.content.length > 200);
  for (let i = 0; i < topResults.length; i++) {
    for (let j = i + 1; j < topResults.length; j++) {
      const aNumbers = [...topResults[i].content.matchAll(numericPattern)].map((m) => m[0].toLowerCase());
      const bNumbers = [...topResults[j].content.matchAll(numericPattern)].map((m) => m[0].toLowerCase());
      for (const aNum of aNumbers) {
        const unit = aNum.split(/\s+/).pop() ?? "";
        const bConflict = bNumbers.find((b) => b.endsWith(unit) && b !== aNum);
        if (bConflict) {
          conflicts.push(
            `âš ï¸ Conflict detected: Source ${i + 1} states "${aNum}" while Source ${j + 1} says "${bConflict}" â€” verify independently.`
          );
        }
      }
    }
  }
  const uniqueConflicts = [...new Set(conflicts)].slice(0, 6);
  conflictCache.set(key, uniqueConflicts);
  return uniqueConflicts;
}


// â”€â”€â”€ Query decomposition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type TopicType =
  | "governance_policy"
  | "legal"
  | "media_press"
  | "democracy_civil_liberties"
  | "sociocultural"
  | "economic"
  | "environment"
  | "security";

export function classifyTopic(query: string): TopicType {
  const q = query.toLowerCase();

  if (/\b(democratic backsliding|democratic erosion|democratic decline|democratic retrenchment|autocratization|shrinking democratic|shrinking civil|democratic space|civil space|civil liberties india|freedom house india|v.?dem|varieties of democracy|eiu democracy index|democracy index india|political freedom india|democratic norms|democratic institutions|electoral authoritarianism|illiberal democracy|competitive authoritarianism|majoritarianism india|minority rights india|dissent india|crackdown on dissent|civil society crackdown|ngos crackdown|fcra india|activists arrested india|opposition arrested|political prisoner india)\b/i.test(q)) return "democracy_civil_liberties";
  if (/\b(cag report|ncrb report|pib release|parliament report|standing committee report)\b/i.test(q)) return "governance_policy";
  if (/\b(press freedom|media freedom|journalist|censorship|rsf|cpj|reporters without borders|shrink(ing)? democratic|shrink(ing)? civil space|shrink(ing)? media|sedition law|sedition charges|sedition section|uapa journalist|section 124|it act journalist|fake news law|crackdown on media|media ownership|media capture|chilling effect|muzzl(ing)? press|silenc(ing)? journalist|defamation journalist|media suppression|free speech crackdown)\b/.test(q)) return "media_press";
  if (/\b(joke|comedy|satire|satirist|stand.?up|meme|humour|humor|blasphemy|offend(ing)? sentiments|hurt religious|art censorship|film ban|book ban|cultural offence|offensive content|why.*(serious|criminal|crime|offence)|speech.*crime|crimin(al|alis(e|z))|comedian arrested)\b/.test(q)) return "sociocultural";
  if (/\b(supreme court|high court|judgement|constitution|article \d+|section \d+|ipc|pocso|crpc|iea|fundamental right|writ|habeas corpus|pil|bail|acquit|verdict|tribunal|bench)\b/.test(q)) return "legal";
  if (/\b(gdp|budget|fiscal|inflation|trade deficit|export|import|rbi|monetary policy|interest rate|currency|forex|gst|tax revenue|growth rate|imf projection|world bank forecast)\b/.test(q)) return "economic";
  if (/\b(climate change|global warming|carbon|emission|pollution|forest|deforestation|biodiversity|coral reef|glacier|net zero|ipcc|cop\d+|paris agreement)\b/.test(q)) return "environment";
  if (/\b(defence|military|armed forces|terrorism|insurgency|border dispute|ceasefire|nuclear|missile|nato|geopolitics|sanctions)\b/.test(q)) return "security";

  return "governance_policy";
}

export async function decomposeQueryByDimension(
  agendaText: string,
  engine: DimensionEngineOutput,
  isDeep: boolean
): Promise<Partial<Record<DimensionName, string[]>>> {
  const queries: Partial<Record<DimensionName, string[]>> = {};
  const { mergedPrimary, absorbedDimensions } = resolveActiveDimensions(engine);

  for (const dim of mergedPrimary) {
    const dimensionQueries = generateDimensionQueries(agendaText, dim, engine.committeeType, isDeep);
    const absorbedForDim = absorbedDimensions.filter((absorbed) => DIMENSION_MERGE_MAP[absorbed] === dim.name);
    const absorbedQueries = absorbedForDim.flatMap((absorbed) => buildAbsorbedDimensionSubQueries(agendaText, absorbed));
    queries[dim.name] = [...dimensionQueries, ...absorbedQueries];
  }

  for (const dim of engine.secondaryDimensions.slice(0, 2)) {
    if (absorbedDimensions.includes(dim.name)) continue;
    queries[dim.name] = generateDimensionQueries(agendaText, dim, engine.committeeType, isDeep).slice(0, 3);
  }

  const deduped = deduplicateAcrossDimensions(queries);
  const cap = isDeep ? 35 : 20;
  const flattenedCount = Object.values(deduped).reduce((sum, items) => sum + (items?.length ?? 0), 0);
  if (flattenedCount <= cap) return deduped;
  logger.warn({ flattenedCount, cap }, "[query-planner] Dimension query cap applied");
  return capDimensionQueries(deduped, cap);
}

const DIMENSION_MERGE_MAP: Partial<Record<DimensionName, DimensionName>> = {
  judiciary: "constitutional",
  international_relations: "diplomatic",
  public_sentiment: "political",
};

export function resolveActiveDimensions(engine: DimensionEngineOutput): {
  mergedPrimary: DimensionScore[];
  absorbedDimensions: DimensionName[];
} {
  const primaryNames = new Set(engine.primaryDimensions.map((dimension) => dimension.name));
  const absorbedDimensions: DimensionName[] = [];
  const mergedPrimary = engine.primaryDimensions.filter((dimension) => {
    const host = DIMENSION_MERGE_MAP[dimension.name];
    if (host && primaryNames.has(host)) {
      absorbedDimensions.push(dimension.name);
      return false;
    }
    return true;
  });
  return { mergedPrimary, absorbedDimensions };
}

function buildAbsorbedDimensionSubQueries(agendaText: string, dimension: DimensionName): string[] {
  const agenda = agendaText.slice(0, 200).trim();
  if (dimension === "judiciary") {
    return [
      `site:indiankanoon.org ${agenda} judgment 2022 2023 2024`,
      `${agenda} LiveLaw Bar and Bench India`,
    ];
  }
  if (dimension === "international_relations") {
    return [
      `${agenda} India UN vote treaty obligation`,
      `${agenda} international pressure India response`,
    ];
  }
  if (dimension === "public_sentiment") {
    return [
      `${agenda} India public opinion protest reaction`,
      `${agenda} opinion poll India political reaction`,
    ];
  }
  return [];
}

function deduplicateAcrossDimensions(
  dimensionQueries: Partial<Record<DimensionName, string[]>>,
  threshold = 0.65,
): Partial<Record<DimensionName, string[]>> {
  const seen: string[] = [];
  const result: Partial<Record<DimensionName, string[]>> = {};
  for (const [dim, queriesForDimension] of Object.entries(dimensionQueries) as [DimensionName, string[]][]) {
    const unique: string[] = [];
    for (const query of queriesForDimension ?? []) {
      const normalized = normalizeQueryForOverlap(query);
      if (seen.every((existing) => getWordOverlap(normalized, existing) < threshold)) {
        unique.push(query);
        seen.push(normalized);
      }
    }
    if (unique.length > 0) result[dim] = unique;
  }
  return result;
}

function capDimensionQueries(
  dimensionQueries: Partial<Record<DimensionName, string[]>>,
  cap: number,
): Partial<Record<DimensionName, string[]>> {
  const result: Partial<Record<DimensionName, string[]>> = {};
  let used = 0;
  for (const [dimension, queriesForDimension] of Object.entries(dimensionQueries) as [DimensionName, string[]][]) {
    if (used >= cap) break;
    const remaining = cap - used;
    result[dimension] = (queriesForDimension ?? []).slice(0, remaining);
    used += result[dimension]?.length ?? 0;
  }
  return result;
}

function normalizeQueryForOverlap(query: string): string {
  return query.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getWordOverlap(a: string, b: string): number {
  const aw = new Set(a.split(/\s+/).filter((word) => word.length > 2));
  const bw = new Set(b.split(/\s+/).filter((word) => word.length > 2));
  if (aw.size === 0 || bw.size === 0) return 0;
  let intersection = 0;
  for (const word of aw) if (bw.has(word)) intersection++;
  return intersection / Math.min(aw.size, bw.size);
}

export function generateDimensionQueries(
  agenda: string,
  dim: DimensionScore,
  _committee: CommitteeType,
  isDeep: boolean
): string[] {
  const q = agenda.slice(0, 200).trim();
  const templates: Record<DimensionName, (query: string) => string[]> = {
    constitutional: (query) => [
      `${query} constitutional validity Article Supreme Court India`,
      `${query} fundamental rights Article 21 19 14 India judgment`,
      `${query} basic structure doctrine India constitutional challenge`,
      `${query} site:indiankanoon.org constitutional bench`,
      `${query} legislative competence India Parliament`,
      `${query} constitutional amendment challenge India`,
    ],
    judiciary: (query) => [
      `${query} Supreme Court India judgment 2022 2023 2024`,
      `${query} High Court India ruling PIL`,
      `site:indiankanoon.org ${query} judgment`,
      `${query} contempt enforcement India court order`,
      `${query} Supreme Court constitutional bench India`,
      `${query} LiveLaw Bar Bench India`,
    ],
    economic: (query) => [
      `${query} India GDP fiscal data NITI Aayog 2024`,
      `${query} Union Budget India revenue expenditure`,
      `${query} RBI India monetary data statistics`,
      `${query} GST revenue India state data 2024`,
      `${query} MoSPI India statistics`,
      `${query} CAG audit fiscal India`,
    ],
    federalism: (query) => [
      `${query} Centre-State dispute India constitutional`,
      `${query} GST Council India state disagreement`,
      `${query} Article 356 Governor India state`,
      `${query} Concurrent List Union State India fiscal`,
      `${query} fiscal devolution Finance Commission India`,
      `${query} state autonomy India Supreme Court`,
    ],
    security: (query) => [
      `${query} India security threat assessment MEA MoD`,
      `${query} AFSPA India armed forces special powers`,
      `${query} India border incident 2023 2024`,
      `${query} SIPRI India military data`,
      `${query} IDSA India security analysis`,
      `${query} internal security India MHA`,
    ],
    human_rights: (query) => [
      `${query} NHRC India human rights commission report`,
      `${query} HRW Amnesty India human rights 2024`,
      `${query} India minority rights protection mechanism`,
      `${query} custodial violence India NCRB data`,
      `${query} Article 21 dignity India Supreme Court`,
      `${query} civil liberties India report`,
    ],
    diplomatic: (query) => [
      `${query} India MEA statement official position`,
      `${query} India bilateral treaty agreement`,
      `${query} India SAARC G20 position diplomatic`,
      `${query} India UN vote resolution diplomatic`,
      `${query} ambassador statement India`,
      `${query} diplomatic crisis India response`,
    ],
    political: (query) => [
      `${query} ruling party India BJP position`,
      `${query} opposition India INC Congress position`,
      `${query} coalition India parliament floor`,
      `${query} India election political implication`,
      `${query} Lok Sabha debate India`,
      `${query} Rajya Sabha debate India`,
    ],
    governance: (query) => [
      `${query} CAG India audit report findings`,
      `${query} India scheme performance PIB data`,
      `${query} accountability transparency India governance`,
      `${query} implementation India ministry report`,
      `${query} parliamentary standing committee report`,
      `${query} government delivery India data`,
    ],
    media_information: (query) => [
      `${query} India press freedom RSF CPJ 2024`,
      `${query} media censorship India sedition IT Act`,
      `${query} journalist arrested India UAPA 2023 2024`,
      `site:rsf.org india ${query}`,
      `${query} misinformation India media ownership`,
      `${query} Article 19 press India Supreme Court`,
    ],
    technological: (query) => [
      `${query} India DPDP Act data protection digital`,
      `${query} Aadhaar UIDAI India data architecture`,
      `${query} India cyber security IT policy`,
      `${query} digital India surveillance framework`,
      `${query} AI governance India policy`,
      `${query} internet shutdown India law`,
    ],
    electoral: (query) => [
      `${query} Election Commission India decision`,
      `${query} EVM India electoral bond controversy`,
      `${query} delimitation India voter rolls`,
      `${query} Model Code of Conduct India election`,
      `${query} campaign finance India Supreme Court`,
      `${query} VVPAT Election Commission India`,
    ],
    social_stability: (query) => [
      `${query} communal harmony India NCRB data`,
      `${query} caste violence India protest movement`,
      `${query} social unrest India government response`,
      `${query} India civil society organization`,
      `${query} riots India state data`,
      `${query} public order India law`,
    ],
    strategic_affairs: (query) => [
      `${query} India strategic autonomy geopolitical`,
      `${query} Quad Indo-Pacific India position`,
      `${query} India China Pakistan strategic balance`,
      `${query} India NSG CTBT NPT strategic`,
      `${query} power projection India`,
      `${query} alliance architecture India foreign policy`,
    ],
    international_relations: (query) => [
      `${query} India UN General Assembly vote resolution`,
      `${query} India ICJ international court position`,
      `${query} India SAARC ASEAN G77 position`,
      `${query} international pressure India response`,
      `${query} diaspora foreign interference India`,
      `${query} treaty obligation India`,
    ],
    public_sentiment: (query) => [
      `${query} India public opinion survey polling`,
      `${query} approval rating government India`,
      `${query} India protest public reaction`,
      `${query} public trust survey India`,
      `${query} opinion poll India`,
      `${query} street opinion India`,
    ],
  };

  return (templates[dim.name]?.(q) ?? [`${q} India ${dim.name.replace(/_/g, " ")} 2024`]).slice(0, isDeep ? 6 : 4);
}


export function countCitations(text: string): number {
  const urls = new Set<string>();
  const re = /\[Source\s*\d+\]\((https?:\/\/[^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) urls.add(canonicalizeUrl(m[1]));
  const re2 = /\[(\d+)\]\((https?:\/\/[^)]+)\)/gi;
  while ((m = re2.exec(text)) !== null) urls.add(canonicalizeUrl(m[2]));
  return urls.size;
}

