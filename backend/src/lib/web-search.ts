// src/lib/web-search.ts
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cascading web search for the MUN Research Engine.
//
// Tier 1: Tavily API         (best quality, requires key)
// Tier 2: Serper.dev         (Google index, requires key)
// Tier 3: Brave Search       (requires key)
// Tier 4: DDG Instant API    (free, minimal data fallback)
//
// SECTION 1 OVERHAUL: Source Scoring & Web Search Overhaul
// - Full Indian government source tier system (scoreSource)
// - Query engineering for Indian gov sources (engineerQueryForIndia)
// - Court judgement structured extraction (extractCourtJudgement)
// - sourceType classification on every result
// - Formatted badges for high-authority sources
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { LRUCache } from "lru-cache";
import type { DimensionScore, SearchResult, CourtJudgement } from "./types.js";
import { canonicalizeUrl, scoreRelevance, type TopicType } from "./rag.js";
import { logger } from "./logger.js";
import { multiKeyFetch } from "./multi-key-fetch.js";
import { cacheGet, cacheSet } from "./cache.js";
import { telemetry } from "./telemetry.js";
import { buildAgendaContract } from "../core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../core/retrieval/query-planner.js";
import type { SourceBucketId } from "../core/retrieval/source-buckets.js";

const GOV_IN_APPLICABLE_PATTERN = /\b(budget|scheme|yojana|ministry|policy|act \d{4}|bill|census|statistics|niti aayog|pib|cabinet|notification|gazette|fund|allocation|crore|lakh|annual report|ncrb|cag|mospi|uidai|rbi|sebi|nfhs|nrhm|pmay|swachh|jan dhan)\b/i;
const GOV_IN_SKIP_PATTERN = /\b(democratic space|press freedom|civil liberties|sedition|crackdown|suppression|dissent|protest|arrest|uapa|shrinking|backsliding|authoritarian|journalist|media freedom|watchdog|ngo foreign|human rights violation|opposition|ngo|censorship|surveillance|custodial|encounter|fake encounter|minority|discrimination|communal|lynching|mob)\b/i;

// Re-export types so existing callers that import from here still work
export type { SearchResult, CourtJudgement } from "./types.js";

type SearchEngine = "serper" | "exa" | "tavily" | "brave" | "ddg";
type SearchKeys = { tavilyKey?: string | null; serperKey?: string | null; exaKey?: string | null; braveKey?: string | null; abortSignal?: AbortSignal };
type RawSearchResult = {
  title: string;
  url: string;
  snippet: string;
  engine: SearchResult["engine"];
  score?: number;
  sourceType?: SearchResult["sourceType"];
  reportType?: string;
  judgement?: CourtJudgement;
  hasRawContent?: boolean;
  publishedDate?: string;
};

// â”€â”€ Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RESULT_CACHE = new LRUCache<string, SearchResult[]>({
  max: 300,
  ttl: 1000 * 60 * 10, // 10 minutes â€” spans sequential role batches
});
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRate: number,
    private minIntervalMs: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    const waitMs = Math.max(Math.ceil(((1 - this.tokens) / this.refillRate) * 1000), this.minIntervalMs);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.tokens = 0;
  }
}

const tavilyLimiter = new RateLimiter(5, 3, 200);
const braveLimiter = new RateLimiter(3, 1, 500);
const serperLimiter = new RateLimiter(5, 5, 100);

interface EngineHealth {
  consecutiveFailures: number;
  lastFailureAt: number;
  circuitOpen: boolean;
}

const engineHealth: Record<"tavily" | "brave" | "serper" | "exa", EngineHealth> = {
  tavily: { consecutiveFailures: 0, lastFailureAt: 0, circuitOpen: false },
  brave: { consecutiveFailures: 0, lastFailureAt: 0, circuitOpen: false },
  serper: { consecutiveFailures: 0, lastFailureAt: 0, circuitOpen: false },
  exa: { consecutiveFailures: 0, lastFailureAt: 0, circuitOpen: false },
};

function isCircuitOpen(engine: keyof typeof engineHealth): boolean {
  const health = engineHealth[engine];
  if (!health.circuitOpen) return false;
  if (Date.now() - health.lastFailureAt > 60_000) {
    health.circuitOpen = false;
    health.consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordEngineFailure(engine: keyof typeof engineHealth): void {
  const health = engineHealth[engine];
  health.consecutiveFailures++;
  health.lastFailureAt = Date.now();
  if (health.consecutiveFailures >= 3) {
    health.circuitOpen = true;
    logger.warn({ engine }, "[web-search] Circuit breaker OPEN - bypassed for 60s");
    telemetry.increment(`search.circuit_open.${engine}`);
  }
}

function recordEngineSuccess(engine: keyof typeof engineHealth): void {
  engineHealth[engine].consecutiveFailures = 0;
}

export function getSearchEngineHealth(): Record<string, EngineHealth> {
  return {
    tavily: { ...engineHealth.tavily },
    brave: { ...engineHealth.brave },
    serper: { ...engineHealth.serper },
    exa: { ...engineHealth.exa },
  };
}

function buildEngineFingerprint(keys: SearchKeys | undefined): string {
  const parts = [
    keys?.tavilyKey?.trim() ? "T" : "",
    keys?.braveKey?.trim()  ? "B" : "",
    keys?.serperKey?.trim() ? "S" : "",
    keys?.exaKey?.trim() ? "E" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("+") : "DDG";
}

// In-flight deduplication: prevents cache stampede when multiple models
// search the same query concurrently before the first one populates the cache.
const inFlight = new Map<string, Promise<SearchResult[]>>();
const IN_FLIGHT_DEEP = new Map<string, Promise<SearchResult[]>>();

const LEGAL_QUERY_PATTERN = /\b(court|judg|verdict|article \d+|section \d+|ipc|crpc|uapa|sedition|constitution|writ|pil|sc|hc|supreme court|high court|tribunal|nclat|ncdrc)\b/i;

// â”€â”€ Source Scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Score a URL by source authority for Indian MUN research.
 *
 * 10 = Indian government (.gov.in) / International tier-1 (UN, World Bank, IMF, ICJ)
 *  9 = High-quality Indian research, legal, and major Indian media
 *  8 = Credible international research and international media
 *  5 = Neutral (Wikipedia, general news not otherwise listed)
 *  1 = Discard (social media, blogs, opinion sites) â€” never returned
 *
 * Hard rule: anything < 5 is DISCARDED before returning to any model.
 */
export function scoreSource(url: string, topic?: TopicType): number {
  const u = url.toLowerCase();

  // â”€â”€ SCORE 1: Discard immediately â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (
    /reddit\.com|quora\.com|medium\.com|substack\.com/.test(u) ||
    /blogspot\.com|wordpress\.com|pinterest\.com/.test(u) ||
    /youtube\.com|instagram\.com|twitter\.com|x\.com/.test(u) ||
    /\/opinion\/|\/blog\/|\/listicle\//.test(u)
  ) return 1;

  if (topic === "media_press" || topic === "sociocultural") {
    if (/\brsf\.org\b|\breporterswithoutborders\.org\b/.test(u)) return 10;
    if (/\bcpj\.org\b/.test(u)) return 10;
    if (/\bfreedomhouse\.org\b/.test(u)) return 10;
    if (/\bhrw\.org\b/.test(u)) return 10;
    if (/\bamnesty(international)?\.org\b/.test(u)) return 9;
    if (/\bmedianama\.com\b/.test(u)) return 9;
    if (/\bthewire\.in\b|\bscroll\.in\b|\bthequint\.com\b/.test(u)) return 9;
    if (/\bbarandbench\.com\b|\blivelaw\.in\b|\bindiankanoon\.org\b/.test(u)) return 9;
    if (/\bthehindu\.com\b|\bindianexpress\.com\b/.test(u)) return 8;
    if (/\.gov\.in(\/|$)/.test(u)) return 7;
    if (/\bun\.org\b|\bundp\.org\b/.test(u)) return 8;
  }

  if (topic === "democracy_civil_liberties") {
    if (/\bv-dem\.net\b/.test(u)) return 10;
    if (/\bfreedomhouse\.org\b/.test(u)) return 10;
    if (/\bhrw\.org\b/.test(u)) return 10;
    if (/\bidea\.int\b/.test(u)) return 10;
    if (/\bcivicus\.org\b|\bcivicusmonitor\b/.test(u)) return 9;
    if (/\barticle14\.com\b/.test(u)) return 9;
    if (/\beiu\.com\b/.test(u)) return 8;
    if (/\bamnesty(international)?\.org\b/.test(u)) return 9;
    if (/\bthewire\.in\b|\bscroll\.in\b|\bindiankanoon\.org\b/.test(u)) return 9;
    if (/\bthehindu\.com\b|\bindianexpress\.com\b/.test(u)) return 8;
    if (/\.gov\.in(\/|$)/.test(u)) return 5;
  }

  // â”€â”€ SCORE 10: Indian government (.gov.in, nic.in) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (
    /\.gov\.in(\/|$)/.test(u) ||
    /\bnic\.in(\/|$)/.test(u) ||
    /cag\.gov\.in/.test(u) ||
    /ncrb\.gov\.in/.test(u) ||
    /pib\.gov\.in/.test(u) ||
    /mea\.gov\.in/.test(u) ||
    /mha\.gov\.in/.test(u) ||
    /mospi\.gov\.in/.test(u) ||
    /rbi\.org\.in/.test(u) ||
    /sebi\.gov\.in/.test(u) ||
    /niti\.gov\.in/.test(u) ||
    /indiabudget\.gov\.in/.test(u) ||
    /india\.gov\.in/.test(u) ||
    /sci\.gov\.in/.test(u) ||
    /supremecourtofindia\.nic\.in/.test(u) ||
    /districts\.ecourts\.gov\.in/.test(u) ||
    /ncpcr\.gov\.in/.test(u) ||
    /nhrc\.nic\.in/.test(u) ||
    /cci\.gov\.in/.test(u) ||
    /ceib\.gov\.in/.test(u) ||
    /censusindia\.gov\.in/.test(u) ||
    /uidai\.gov\.in/.test(u)
  ) return 10;

  // â”€â”€ SCORE 10: International tier-1 intergovernmental â”€â”€â”€â”€â”€â”€â”€
  if (
    /\bun\.org\b/.test(u) ||
    /\bundp\.org\b/.test(u) ||
    /\bunicef\.org\b/.test(u) ||
    /\bunhcr\.org\b/.test(u) ||
    /\bwho\.int\b/.test(u) ||
    /\bworldbank\.org\b/.test(u) ||
    /\bimf\.org\b/.test(u) ||
    /\boecd\.org\b/.test(u) ||
    /\bicj-cij\.org\b/.test(u) ||
    /\bicc-cpi\.int\b/.test(u)
  ) return 10;

  // â”€â”€ SCORE 9: High-quality Indian sources â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (
    /prsindia\.org/.test(u) ||
    /indiankanoon\.org/.test(u) ||
    /livelaw\.in/.test(u) ||
    /barandbench\.com/.test(u) ||
    /lawschoolpolicyreview\.com/.test(u) ||
    /iipsindia\.ac\.in/.test(u) ||
    /rchiips\.org/.test(u) ||
    /nfhs\.gov\.in/.test(u) ||
    /epw\.in/.test(u) ||
    /idsa\.in/.test(u) ||
    /icrier\.org/.test(u) ||
    /cprindia\.org/.test(u) ||
    /thehindu\.com/.test(u) ||
    /indianexpress\.com/.test(u) ||
    /livemint\.com/.test(u) ||
    /business-standard\.com/.test(u)
  ) return 9;

  // â”€â”€ SCORE 8: Credible international research & media â”€â”€â”€â”€â”€â”€â”€
  if (
    /brookings\.edu/.test(u) ||
    /cfr\.org/.test(u) ||
    /sipri\.org/.test(u) ||
    /chathamhouse\.org/.test(u) ||
    /jstor\.org/.test(u) ||
    /ssrn\.com/.test(u) ||
    /scholar\.google\.com/.test(u) ||
    /reuters\.com/.test(u) ||
    /apnews\.com/.test(u) ||
    /bbc\.com/.test(u) ||
    /aljazeera\.com/.test(u)
  ) return 8;

  // â”€â”€ SCORE 5: Other .gov / .ac / .edu (non-Indian) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (
    /\.gov\b|\.gov\//.test(u) ||
    /\.edu\b|\.edu\//.test(u) ||
    /\.ac\.[a-z]{2,}/.test(u)
  ) return 5;

  // â”€â”€ SCORE 5: Neutral (Wikipedia, general news) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return 5;
}

// â”€â”€ Source Type Classification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Classify the source type based on URL patterns.
 * Used to populate SearchResult.sourceType.
 */
export function classifySourceType(url: string): SearchResult["sourceType"] {
  const u = url.toLowerCase();

  const COURT_SOURCES = [
    "indiankanoon.org", "sci.gov.in", "supremecourtofindia.nic.in",
    "districts.ecourts.gov.in", "livelaw.in", "barandbench.com",
  ];
  if (COURT_SOURCES.some(s => u.includes(s))) return "court_judgement";

  if (/\.gov\.in(\/|$)|\bnic\.in(\/|$)|rbi\.org\.in/.test(u)) return "government_india";

  if (
    /\bun\.org\b|\bundp\.org\b|\bunicef\.org\b|\bunhcr\.org\b|\bwho\.int\b/.test(u) ||
    /\bworldbank\.org\b|\bimf\.org\b|\boecd\.org\b|\bicj-cij\.org\b|\bicc-cpi\.int\b/.test(u)
  ) return "government_international";

  if (/prsindia\.org|cprindia\.org|idsa\.in|icrier\.org|epw\.in|iipsindia\.ac\.in/.test(u)) {
    return "academic_india";
  }

  if (/livelaw\.in|barandbench\.com|lawschoolpolicyreview\.com/.test(u)) return "legal_india";

  if (/thehindu\.com|indianexpress\.com|livemint\.com|business-standard\.com/.test(u)) {
    return "media_india";
  }

  if (
    /brookings\.edu|cfr\.org|sipri\.org|chathamhouse\.org|jstor\.org|ssrn\.com/.test(u) ||
    /reuters\.com|apnews\.com|bbc\.com|aljazeera\.com/.test(u) ||
    /freedomhouse\.org|v-dem\.net|civicus\.org|civicusmonitor|idea\.int|article14\.com|eiu\.com/.test(u)
  ) return "international_research";

  return "general";
}

/**
 * Detect a human-readable report type label from the URL and title.
 * Returns a string like "CAG Annual Report 2024" or undefined.
 */
function detectReportType(url: string, title: string): string | undefined {
  const u = url.toLowerCase();
  const t = title.toLowerCase();
  const yearMatch = /\b(202[0-9]|201[0-9]|200[0-9])\b/.exec(u + " " + t);
  const year = yearMatch ? yearMatch[1] : "";

  if (u.includes("cag.gov.in")) return `CAG Report${year ? " " + year : ""}`;
  if (u.includes("ncrb.gov.in")) return `NCRB Crime in India${year ? " " + year : ""}`;
  if (u.includes("pib.gov.in")) return `PIB Press Release${year ? " " + year : ""}`;
  if (u.includes("indiabudget.gov.in")) return `Union Budget${year ? " " + year : ""}`;
  if (u.includes("mospi.gov.in") || t.includes("mospi")) return `MoSPI Statistical Report${year ? " " + year : ""}`;
  if (u.includes("rbi.org.in")) return `RBI Report${year ? " " + year : ""}`;
  if (u.includes("niti.gov.in") || t.includes("niti aayog")) return `NITI Aayog Report${year ? " " + year : ""}`;
  if (u.includes("sebi.gov.in")) return `SEBI Report${year ? " " + year : ""}`;
  return undefined;
}

// â”€â”€ Court Judgement Extractor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COURT_URL_PATTERNS = [
  "indiankanoon.org",
  "sci.gov.in",
  "supremecourtofindia.nic.in",
  "livelaw.in",
  "barandbench.com",
  "districts.ecourts.gov.in",
];

const LEGAL_TERMS = /\b(held|petitioner|respondent|writ|article|section|judgement|judgment|appellant|bench|honourable|hon'ble|suo motu|coram|vs\.|versus)\b/i;

/**
 * Attempt to extract structured court judgement data from page content.
 * Returns a CourtJudgement object; isJudgement is false if not detected.
 */
export function extractCourtJudgement(content: string, url: string): CourtJudgement {
  const isCourtUrl = COURT_URL_PATTERNS.some(p => url.toLowerCase().includes(p));
  const hasLegalTerms = LEGAL_TERMS.test(content);
  const isJudgement = isCourtUrl && hasLegalTerms;

  if (!isJudgement) {
    return { isJudgement: false, caseName: "", caseNumber: "", year: "", court: "", bench: "", held: "", relevance: "", url };
  }

  // Case name â€” "X v. Y" / "X vs. Y" / "X versus Y"
  const caseNameMatch =
    /([A-Z][A-Za-z\s&.,'()-]{3,60})\s+v(?:s\.?|ersus)\.?\s+([A-Z][A-Za-z\s&.,'()-]{3,60})/
      .exec(content);
  const caseName = caseNameMatch
    ? `${caseNameMatch[1].trim()} v. ${caseNameMatch[2].trim()}`
    : "";

  // Case number â€” Writ Petition / Civil Appeal / Criminal Appeal / SLP patterns
  const caseNumMatch =
    /(?:Writ Petition|Civil Appeal|Criminal Appeal|SLP|Special Leave Petition|Transfer Petition|Original Suit)\s+(?:\(Civil\)|\(Criminal\))?\s*(?:No\.?\s*)?\d+\s+(?:of\s+)?\d{4}/i
      .exec(content);
  const caseNumber = caseNumMatch ? caseNumMatch[0].trim() : "";

  // Year â€” prefer from case number, else from content
  const yearMatch = /\b(1[89]\d{2}|20[0-2]\d)\b/.exec(caseNumber || content);
  const year = yearMatch ? yearMatch[1] : "";

  // Court name
  let court = "Supreme Court of India";
  if (/high court/i.test(content)) {
    const hcMatch = /([A-Z][a-z]+(?: [A-Z][a-z]+)*\s+High Court)/i.exec(content);
    court = hcMatch ? hcMatch[1] : "High Court";
  } else if (/district court/i.test(content)) {
    court = "District Court";
  } else if (/national consumer/i.test(content)) {
    court = "National Consumer Disputes Redressal Commission";
  } else if (/tribunal/i.test(content)) {
    const tMatch = /([A-Z][A-Za-z\s]+Tribunal)/i.exec(content);
    court = tMatch ? tMatch[1].trim() : "Tribunal";
  }

  // Bench / judges â€” "BENCH: J. Smith, J. Doe" or "Coram: ..."
  const benchMatch = /(?:bench|coram)\s*[:\-]\s*([A-Za-z.,\s;J\.]{5,120})/i.exec(content);
  const bench = benchMatch ? benchMatch[1].replace(/\s+/g, " ").trim() : "";

  // Held â€” extract sentence(s) containing "held" / "the court held" / "it was held"
  const heldSentences: string[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if (/\bheld\b|\bcourt held\b|\bit was held\b/i.test(s) && s.length > 30 && s.length < 500) {
      heldSentences.push(s.trim());
      if (heldSentences.length >= 3) break;
    }
  }
  const held = heldSentences.join(" ") || content.slice(0, 300).replace(/\s+/g, " ").trim();

  const relevance = "";

  return { isJudgement: true, caseName, caseNumber, year, court, bench, held, relevance, url };
}

// â”€â”€ Query Engineering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Takes any user query and returns 6 engineered sub-queries targeting
 * Indian government sources, court databases, and official reports.
 */
function activeSearchEngine(keys?: SearchKeys): SearchEngine {
  return keys?.serperKey?.trim()
    ? "serper"
    : keys?.exaKey?.trim()
      ? "exa"
      : keys?.tavilyKey?.trim()
        ? "tavily"
        : keys?.braveKey?.trim()
          ? "brave"
          : "ddg";
}

// ── Dual-Engine Parallel Search ─────────────────────────────────────────────
// Fires Tavily + Brave (or Serper) simultaneously when both keys are available.
// Falls back gracefully to single-engine or DDG when keys are missing.
async function fetchDualEngine(
  query: string,
  keys: SearchKeys | undefined,
  deep: boolean
): Promise<RawSearchResult[]> {
  const tavilyKey = keys?.tavilyKey?.trim() ?? null;
  const braveKey = keys?.braveKey?.trim() ?? null;
  const serperKey = keys?.serperKey?.trim() ?? null;
  const exaKey = keys?.exaKey?.trim() ?? null;

  const hasTavily = !!tavilyKey;
  const hasBrave = !!braveKey;
  const hasSerper = !!serperKey;
  const hasExa = !!exaKey;
  const premiumFetches: Array<Promise<RawSearchResult[]>> = [];
  if (hasSerper) premiumFetches.push(_fetchSerper(query, serperKey!, keys?.abortSignal));
  if (hasExa) premiumFetches.push(_fetchExa(query, exaKey!, deep, keys?.abortSignal));
  if (hasTavily) premiumFetches.push(_fetchTavily(query, tavilyKey!, deep, 0, keys?.abortSignal));
  if (hasBrave) premiumFetches.push(_fetchBrave(query, braveKey!, deep, keys?.abortSignal));

  if (premiumFetches.length > 0) {
    const settled = await Promise.allSettled(premiumFetches);
    const groups = settled.filter((result): result is PromiseFulfilledResult<RawSearchResult[]> => result.status === "fulfilled").map((result) => result.value);
    const merged = mergeRawResultsDualEngine(groups[0] ?? [], groups[1] ?? [], ...groups.slice(2));
    logger.info(`[multi-engine] results=${merged.length} query="${query.slice(0, 60)}"`);
    return merged;
  }

  logger.warn(
    "[retrieval] NO PREMIUM SEARCH KEY CONFIGURED. " +
    "Set TAVILY_API_KEY + BRAVE_API_KEY in .env or in Settings → Keys. " +
    "Falling back to DDG Instant (near-zero parliamentary research quality)."
  );
  return _fetchDdgInstant(query, keys?.abortSignal).catch(() => []);
}

function mergeRawResultsDualEngine(
  primary: RawSearchResult[],
  secondary: RawSearchResult[],
  ...additional: RawSearchResult[][]
): RawSearchResult[] {
  const seen = new Set<string>();
  const merged: RawSearchResult[] = [];

  for (const r of primary) {
    const key = r.url.toLowerCase().split("?")[0].replace(/\/$/, "");
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  const secondaryDeduped: RawSearchResult[] = [];
  for (const r of secondary) {
    const key = r.url.toLowerCase().split("?")[0].replace(/\/$/, "");
    if (!seen.has(key)) {
      seen.add(key);
      secondaryDeduped.push(r);
    }
  }

  const result = [...merged];
  let insertAt = 3;
  for (const r of secondaryDeduped) {
    if (insertAt >= result.length) {
      result.push(r);
    } else {
      result.splice(insertAt, 0, r);
      insertAt += 4;
    }
  }
  for (const group of additional) {
    for (const r of group) {
      const key = r.url.toLowerCase().split("?")[0].replace(/\/$/, "");
      if (!seen.has(key)) {
        seen.add(key);
        result.push(r);
      }
    }
  }

  return result;
}

export function hasExpectedSources(results: SearchResult[], topic: TopicType): boolean {
  if (results.length === 0) return false;
  const urls = results.map(r => r.url.toLowerCase());

  if (topic === "democracy_civil_liberties") {
    const watchdogHits = urls.filter(u =>
      u.includes("freedomhouse.org") ||
      u.includes("v-dem.net") ||
      u.includes("hrw.org") ||
      u.includes("civicus.org") ||
      u.includes("civicusmonitor") ||
      u.includes("idea.int")
    );
    return watchdogHits.length >= 3;
  }

  if (topic === "media_press") {
    return urls.some(u =>
      u.includes("rsf.org") ||
      u.includes("cpj.org") ||
      u.includes("freedomhouse.org") ||
      u.includes("hrw.org")
    );
  }

  return true;
}

export function engineerQueryForIndia(query: string, engine?: SearchEngine): string[] {
  return engineeredQueriesFromOfficialPlanner(query, engine, ["government_official", "parliamentary_records", "policy_research", "court_legal"]);
}

export function engineerQueryForMedia(query: string, engine?: SearchEngine): string[] {
  return engineeredQueriesFromOfficialPlanner(query, engine, ["indian_major_media", "press_freedom", "human_rights_watchdog", "digital_rights"]);
}

export function engineerQueryForSociocultural(query: string, engine?: SearchEngine): string[] {
  return engineeredQueriesFromOfficialPlanner(query, engine, ["court_legal", "legal_commentary", "indian_major_media", "academic_research"]);
}

export function engineerQueryForDemocracy(query: string, engine?: SearchEngine): string[] {
  return engineeredQueriesFromOfficialPlanner(query, engine, ["democracy_index", "human_rights_watchdog", "civic_space", "press_freedom", "digital_rights"]);
}

function engineeredQueriesFromOfficialPlanner(query: string, engine: SearchEngine | undefined, preferredBuckets: SourceBucketId[]): string[] {
  const contract = buildAgendaContract({ originalUserQuery: query, outputDepth: "detailed" });
  const plan = buildBucketedQueryPlan(contract, "deep_research");
  const preferred = plan.queries
    .filter((item) => preferredBuckets.includes(item.bucketId))
    .map((item) => item.query);
  const fallback = plan.queries.map((item) => item.query);
  const selected = [...preferred, ...fallback]
    .filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 8);
  if (engine === "tavily" || engine === "ddg") {
    return selected.map((item) => item.replace(/\bsite:([^\s]+)/gi, "$1").replace(/\s+/g, " ").trim());
  }
  return selected;
}

// â”€â”€ Post-processing pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Recency signal: extract the most recent year mentioned in the URL/title.
 * Returns a numeric score for sorting within the same tier.
 */
function recencyScore(url: string, title: string): number {
  const combined = url + " " + title;
  const matches = combined.match(/\b(202[0-9]|201[0-9])\b/g);
  if (!matches) return 0;
  return Math.max(...matches.map(Number));
}

function isImpersonatorDomain(result: RawSearchResult): boolean {
  const u = result.url.toLowerCase();
  const t = result.title.toLowerCase();
  if (t.includes("human rights watch") && !u.includes("hrw.org")) return true;
  if (t.includes("amnesty international") && !u.includes("amnesty")) return true;
  if (t.includes("freedom house") && !u.includes("freedomhouse.org")) return true;
  if (t.includes("v-dem") && !u.includes("v-dem.net") && !u.includes("gothenburg")) return true;
  if (/thehuman-rights\.com|globaldemocracy-report\.com/.test(u)) return true;
  return false;
}

/**
 * Apply full post-processing pipeline to raw results:
 * 1. Score each result with scoreSource()
 * 2. Discard score < 5
 * 3. Classify sourceType
 * 4. Detect reportType for official reports
 * 5. Run court judgement extractor for court sources
 * 6. Sort: score 10 first â†’ 9 â†’ 8 â†’ 5; within same tier by recency
 */
function postProcess(
  raw: RawSearchResult[],
  topic?: TopicType
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const r of raw) {
    if (isImpersonatorDomain(r)) continue;

    const score = typeof r.score === "number" ? r.score : scoreSource(r.url, topic);
    if (score < 5) continue;

    const sourceType = r.sourceType ?? classifySourceType(r.url);
    const reportType = r.reportType ?? detectReportType(r.url, r.title);

    const result: SearchResult = {
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      engine: r.engine,
      score,
      sourceType,
      hasRawContent: r.hasRawContent,
      publishedDate: r.publishedDate,
    };
    if (reportType) result.reportType = reportType;
    if (r.judgement) result.judgement = r.judgement;
    results.push(result);
  }

  // Sort: primary = score desc, secondary = recency desc
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return recencyScore(b.url, b.title) - recencyScore(a.url, a.title);
  });

  return results;
}

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Main search function. Call this from all route handlers.
 *
 * @param query      - The search query string
 * @param tavilyKey  - Optional Tavily API key (from RequestKeys.tavilyKey)
 * @returns          - Deduplicated, scored, filtered results (score >= 5)
 *
 * Post-fetch behaviour:
 * - Discards anything scored < 5
 * - Classifies sourceType and reportType
 * - Attempts court judgement extraction for court URLs
 * - If no score-10 Indian government results found, auto-reruns with engineerQueryForIndia()
 * - Hard limit: 15 results, with at least 3 score-10 Indian gov sources when available
 */
export async function searchWeb(
  query: string,
  keys?: {
    tavilyKey?: string | null;
    serperKey?: string | null;
    exaKey?: string | null;
    braveKey?: string | null;
    abortSignal?: AbortSignal;
  },
  topic?: TopicType
): Promise<SearchResult[]> {
  if (!query?.trim()) return [];

  const q = query.trim();
  const tier = activeSearchEngine(keys);
  const engineFingerprint = buildEngineFingerprint(keys);
  const cacheKey = `${engineFingerprint}::${topic ?? "default"}::${q.slice(0, 120)}`;

  const cached = await cacheGet<SearchResult[]>(cacheKey);
  if (cached) {
    logger.info(`[web-search] CACHE HIT tier=${tier} results=${cached.length} query="${q.slice(0, 60)}"`);
    return cached;
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    logger.info(`[web-search] IN-FLIGHT HIT tier=${tier} query="${q.slice(0, 60)}"`);
    return existing;
  }

  logger.info(`[web-search] START tier=${tier} query="${q.slice(0, 80)}"`);
  const promise = _doSearchWeb(q, keys, topic, cacheKey).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

async function _doSearchWeb(
  q: string,
  keys: SearchKeys | undefined,
  topic: TopicType | undefined,
  cacheKey: string
): Promise<SearchResult[]> {
  let rawResults = await fetchDualEngine(q, keys, false);

  if (shouldSearchIndianKanoon(q, topic)) {
    const legalResults = await searchIndianKanoon(q, topic, keys?.abortSignal).catch(() => [] as RawSearchResult[]);
    rawResults = mergeRawResultsDualEngine(rawResults, legalResults as RawSearchResult[]);
  }

  let results = postProcess(rawResults, topic);

  if (topic === "democracy_civil_liberties" && !hasExpectedSources(results, topic)) {
    const emergencyQueries = engineerQueryForDemocracy(q).slice(0, 3);
    logger.info({ emergencyQueries }, "[web-search] democracy watchdog top-up");
    const emergencyRaw = (await Promise.allSettled(
      emergencyQueries.map(eq => fetchDualEngine(eq, keys, false))
    )).filter((r): r is PromiseFulfilledResult<RawSearchResult[]> => r.status === "fulfilled")
      .flatMap(r => r.value);
    const emergencyResults = postProcess(emergencyRaw, topic);
    const seen = new Set(results.map(r => canonicalizeUrl(r.url)));
    for (const er of emergencyResults) {
      if (!seen.has(canonicalizeUrl(er.url))) {
        seen.add(canonicalizeUrl(er.url));
        results.push(er);
      }
    }
    results.sort((a, b) => b.score !== a.score ? b.score - a.score
      : recencyScore(b.url, b.title) - recencyScore(a.url, a.title));
  }

  const govInResults = results.filter(r => r.sourceType === "government_india" && r.score === 10);
  const isIndianDomesticQuery = /\b(india|indian|NCRB|CAG|PIB|MEA|NITI|IPC|article \d+|section \d+)\b/i.test(q);
  const shouldRunGovFallback = isIndianDomesticQuery
    && govInResults.length < 2
    && GOV_IN_APPLICABLE_PATTERN.test(q)
    && !GOV_IN_SKIP_PATTERN.test(q);

  if (shouldRunGovFallback) {
    logger.info(`[web-search] Gov.in fallback: only ${govInResults.length} gov results, running engineered queries`);
    const engineeredQueries = getTopicEngineeredQueries(q, topic);
    const subRaw = (await Promise.allSettled(
      engineeredQueries.slice(0, 4).map(eq => fetchDualEngine(eq, keys, false))
    )).filter((r): r is PromiseFulfilledResult<RawSearchResult[]> => r.status === "fulfilled")
      .flatMap(r => r.value);
    const engineeredResults = postProcess(subRaw, topic);
    const seen = new Set(results.map(r => canonicalizeUrl(r.url)));
    for (const er of engineeredResults) {
      if (!seen.has(canonicalizeUrl(er.url))) {
        seen.add(canonicalizeUrl(er.url));
        results.push(er);
      }
    }
    results.sort((a, b) => b.score !== a.score ? b.score - a.score
      : recencyScore(b.url, b.title) - recencyScore(a.url, a.title));
    logger.info(`[web-search] After gov.in fallback: ${results.length} total results`);
  }

  results = applyResultLimit(results, topic);

  logSearchTelemetry(q, activeSearchEngine(keys), results);
  logger.info(`[web-search] DONE results=${results.length} engine=${keys?.tavilyKey && keys?.braveKey ? "dual" : "single"} query="${q.slice(0, 60)}"`);
  if (results.length > 0) await cacheSet(cacheKey, results, 600);
  return results;
}

function logSearchTelemetry(q: string, tier: string, results: SearchResult[]): void {
  logger.info({
    event: "search_complete",
    query: q.slice(0, 80),
    engine: tier,
    resultsTotal: results.length,
    govInCount: results.filter((r) => r.sourceType === "government_india").length,
    courtCount: results.filter((r) => r.sourceType === "court_judgement").length,
    academicCount: results.filter((r) => r.sourceType === "academic_india").length,
    topUrls: results.slice(0, 3).map((r) => r.url),
  }, "[web-search] PIPELINE TELEMETRY");
}

function getTopicEngineeredQueries(q: string, topic?: TopicType): string[] {
  if (topic === "media_press") return engineerQueryForMedia(q);
  if (topic === "sociocultural") return engineerQueryForSociocultural(q);
  if (topic === "democracy_civil_liberties") return engineerQueryForDemocracy(q);
  return engineerQueryForIndia(q);
}

function applyResultLimit(results: SearchResult[], topic?: TopicType): SearchResult[] {
  const sensitiveTopics: TopicType[] = ["media_press", "sociocultural", "democracy_civil_liberties"];
  if (topic && sensitiveTopics.includes(topic)) {
    return results.slice(0, 15);
  }
  const govTop = results.filter(r => r.sourceType === "government_india" && r.score === 10).slice(0, 4);
  const rest = results.filter(r => !(r.sourceType === "government_india" && r.score === 10));
  return [...govTop, ...rest].slice(0, 15);
}

/**
 * Deep search — runs Tavily advanced + DDG HTML in parallel for maximum coverage.
 * Backward-compatible wrapper used by anthropic.ts orchestration layer.
 */
export async function searchWebDeep(
  query: string,
  keys?: {
    tavilyKey?: string | null;
    serperKey?: string | null;
    exaKey?: string | null;
    braveKey?: string | null;
    abortSignal?: AbortSignal;
  },
  topic?: TopicType
): Promise<SearchResult[]> {
  if (!query?.trim()) return [];
  const q = query.trim();
  const tier = activeSearchEngine(keys);
  const engineFingerprint = buildEngineFingerprint(keys);
  const cacheKey = `deep::${engineFingerprint}::${topic ?? "default"}::${q.slice(0, 120)}`;
  const cached = await cacheGet<SearchResult[]>(cacheKey);
  if (cached) {
    logger.info(`[web-search] CACHE HIT deep results=${cached.length} query="${q.slice(0, 60)}"`);
    return cached;
  }

  const existing = IN_FLIGHT_DEEP.get(cacheKey);
  if (existing) {
    logger.info(`[web-search] IN-FLIGHT HIT deep tier=${tier} query="${q.slice(0, 60)}"`);
    return existing;
  }

  logger.info(`[web-search] DEEP START tier=${tier} query="${q.slice(0, 80)}"`);
  const promise = _doSearchWebDeep(q, keys, topic, cacheKey).finally(() => {
    IN_FLIGHT_DEEP.delete(cacheKey);
  });
  IN_FLIGHT_DEEP.set(cacheKey, promise);
  return promise;
}

async function _doSearchWebDeep(
  q: string,
  keys: SearchKeys | undefined,
  topic: TopicType | undefined,
  cacheKey: string
): Promise<SearchResult[]> {
  let rawResults = await fetchDualEngine(q, keys, true);

  if (shouldSearchIndianKanoon(q, topic)) {
    const legalResults = await searchIndianKanoon(q, topic, keys?.abortSignal).catch(() => [] as RawSearchResult[]);
    rawResults = mergeRawResultsDualEngine(rawResults, legalResults as RawSearchResult[]);
  }

  let results = postProcess(rawResults, topic);

  if (topic === "democracy_civil_liberties" && !hasExpectedSources(results, topic)) {
    const emergencyQueries = engineerQueryForDemocracy(q).slice(0, 3);
    logger.info({ emergencyQueries }, "[web-search] democracy watchdog top-up");
    const emergencyRaw = (await Promise.allSettled(
      emergencyQueries.map(eq => fetchDualEngine(eq, keys, true))
    )).filter((r): r is PromiseFulfilledResult<RawSearchResult[]> => r.status === "fulfilled")
      .flatMap(r => r.value);
    const emergencyResults = postProcess(emergencyRaw, topic);
    const seen = new Set(results.map(r => canonicalizeUrl(r.url)));
    for (const er of emergencyResults) {
      if (!seen.has(canonicalizeUrl(er.url))) {
        seen.add(canonicalizeUrl(er.url));
        results.push(er);
      }
    }
    results.sort((a, b) => b.score !== a.score ? b.score - a.score
      : recencyScore(b.url, b.title) - recencyScore(a.url, a.title));
  }

  const govInResults = results.filter(r => r.sourceType === "government_india" && r.score === 10);
  const isIndianDomesticQuery = /\b(india|indian|NCRB|CAG|PIB|MEA|NITI|IPC|article \d+|section \d+)\b/i.test(q);
  const shouldRunGovFallback = isIndianDomesticQuery
    && govInResults.length < 2
    && GOV_IN_APPLICABLE_PATTERN.test(q)
    && !GOV_IN_SKIP_PATTERN.test(q);

  if (shouldRunGovFallback) {
    logger.info(`[web-search] Gov.in fallback: only ${govInResults.length} gov results, running engineered queries`);
    const engineeredQueries = getTopicEngineeredQueries(q, topic);
    const subRaw = (await Promise.allSettled(
      engineeredQueries.slice(0, 4).map(eq => fetchDualEngine(eq, keys, true))
    )).filter((r): r is PromiseFulfilledResult<RawSearchResult[]> => r.status === "fulfilled")
      .flatMap(r => r.value);
    const engineeredResults = postProcess(subRaw, topic);
    const seen = new Set(results.map(r => canonicalizeUrl(r.url)));
    for (const er of engineeredResults) {
      if (!seen.has(canonicalizeUrl(er.url))) {
        seen.add(canonicalizeUrl(er.url));
        results.push(er);
      }
    }
    results.sort((a, b) => b.score !== a.score ? b.score - a.score
      : recencyScore(b.url, b.title) - recencyScore(a.url, a.title));
    logger.info(`[web-search] After gov.in fallback: ${results.length} total results`);
  }

  results = results.slice(0, 20);
  logSearchTelemetry(q, activeSearchEngine(keys), results);
  logger.info(`[web-search] DEEP DONE total=${results.length} results for "${q.slice(0, 60)}"`);
  if (results.length > 0) await cacheSet(cacheKey, results, 600);
  return results;
}

/**
 * Format search results for display in chat context.
 * Adds source-type badges for high-authority Indian sources.
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No search results found for this query.";
  }

  return results
    .map((r, i) => {
      const badge = sourceBadge(r);
      const prefix = badge ? `${badge} ` : "";
      const reportLine = r.reportType ? `\nReport: ${r.reportType}` : "";
      const judgementLine = r.judgement?.isJudgement
        ? `\nCase: ${r.judgement.caseName}${r.judgement.year ? ` (${r.judgement.year})` : ""}` +
          (r.judgement.held ? `\nHeld: ${r.judgement.held.slice(0, 200)}` : "")
        : "";
      return (
        `[${i + 1}] ${prefix}${r.title}\nURL: ${r.url}` +
        (r.snippet ? `\nSnippet: ${r.snippet}` : "") +
        reportLine +
        judgementLine
      );
    })
    .join("\n\n");
}

/**
 * Return a badge string for the source type.
 */
export function sourceBadge(r: SearchResult): string {
  const u = r.url.toLowerCase();
  if (u.includes("cag.gov.in"))  return "ðŸ“Š [CAG REPORT]";
  if (u.includes("ncrb.gov.in")) return "ðŸ”¢ [NCRB DATA]";
  if (u.includes("pib.gov.in"))  return "ðŸ“¢ [PIB OFFICIAL]";
  if (r.sourceType === "court_judgement") return "âš–ï¸  [COURT]";
  if (r.sourceType === "government_india" && r.score === 10) return "ðŸ ›ï¸  [GOV.IN]";
  if (r.sourceType === "government_international" && r.score === 10) return "ðŸŒ  [INTL GOV]";
  return "";
}

export function buildDimensionAwareSearchQuery(
  baseQuery: string,
  dimension: DimensionScore,
  iteration: number
): string {
  const yearRange = "2022 2023 2024 2025";

  switch (dimension.name) {
    case "constitutional":
    case "judiciary":
      return iteration === 0
        ? `${baseQuery} site:indiankanoon.org`
        : `${baseQuery} Supreme Court India judgment ${yearRange}`;
    case "governance":
    case "economic":
      return iteration === 0
        ? `${baseQuery} site:cag.gov.in OR site:ncrb.gov.in`
        : `${baseQuery} India government report ${yearRange}`;
    case "diplomatic":
    case "international_relations":
      return iteration === 0
        ? `${baseQuery} site:mea.gov.in`
        : `${baseQuery} India UN position statement ${yearRange}`;
    case "media_information":
      return iteration === 0
        ? `${baseQuery} site:rsf.org OR site:cpj.org`
        : `${baseQuery} press freedom India ${yearRange}`;
    case "human_rights":
      return iteration === 0
        ? `${baseQuery} site:hrw.org OR site:amnesty.org`
        : `${baseQuery} India human rights report ${yearRange}`;
    default:
      return `${baseQuery} India ${yearRange}`;
  }
}

function shouldSearchIndianKanoon(query: string, topic?: TopicType): boolean {
  return (
    LEGAL_QUERY_PATTERN.test(query) ||
    topic === "media_press" ||
    topic === "democracy_civil_liberties" ||
    topic === "legal" ||
    topic === "sociocultural"
  );
}

export async function searchIndianKanoon(query: string, topic?: TopicType, abortSignal?: AbortSignal): Promise<SearchResult[]> {
  const shouldSearch = shouldSearchIndianKanoon(query, topic);
  if (!shouldSearch) return [];

  const params = new URLSearchParams({ formInput: query.slice(0, 100), pagenum: "0" });
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), 6000);

  let resp: Response;
  try {
    resp = await fetch(`https://api.indiankanoon.org/search/?${params}`, {
      method: "POST",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
  } finally {
    abortSignal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }

  if (!resp.ok) return [];

  const data = await resp.json() as {
    docs?: Array<{ tid?: number; title?: string; headline?: string; publishdate?: string }>;
  };

  return (data.docs ?? []).filter(doc => doc.tid).slice(0, 5).map(doc => {
    const title = doc.title ?? "Indian Court Judgement";
    const snippet = doc.headline ?? "";
    const url = `https://indiankanoon.org/doc/${doc.tid}/`;
    const relevanceScore = scoreRelevance(query, title, snippet, url);
    const score = Math.min(9, Math.max(7, Math.round(relevanceScore * 10)));
    return {
      title,
      url,
      snippet,
      engine: "indiankanoon" as const,
      score,
      sourceType: "court_judgement" as const,
    };
  });
}

// â”€â”€ Private fetch helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function _fetchTavily(
  query: string,
  apiKey: string,
  deep = false,
  retryCount = 0,
  abortSignal?: AbortSignal
): Promise<RawSearchResult[]> {
  if (isCircuitOpen("tavily")) return [];
  await tavilyLimiter.acquire();

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), 8000);
  const safeQuery = query.slice(0, 200).trim(); // Tavily handles up to 400 chars.

  let resp: Response;
  try {
    resp = await multiKeyFetch("https://api.tavily.com/search", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: safeQuery,
        search_depth:     deep ? "advanced" : "basic",
        include_answer:   false,
        include_raw_content: true,
        include_domains:  [],
        exclude_domains:  [
          "pinterest.com", "reddit.com", "quora.com",
          "facebook.com", "instagram.com", "twitter.com", "x.com",
        ],
        max_results: deep ? 20 : 12,
      }),
      signal: controller.signal,
    });
  } finally {
    abortSignal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    if (resp.status === 429 && retryCount < 2 && !abortSignal?.aborted) {
      await new Promise(r => setTimeout(r, retryCount === 0 ? 3000 : 7000));
      if (abortSignal?.aborted) throw new Error("Aborted");
      return _fetchTavily(query, apiKey, deep, retryCount + 1, abortSignal);
    }
    recordEngineFailure("tavily");
    throw new Error(`Tavily HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
  }
  recordEngineSuccess("tavily");

  const data = await resp.json() as { results?: Array<{
    title?: string; url?: string; content?: string; snippet?: string; raw_content?: string;
  }> };

  return (data.results ?? []).map((r) => {
    const hasRawContent = !!(r.raw_content && r.raw_content.length > 500);
    return {
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: hasRawContent
        ? r.raw_content!.slice(0, 8000)
        : (r.content ?? r.snippet ?? ""),
      engine: "tavily" as const,
      hasRawContent,
    };
  }).filter(r => r.url);
}

async function _fetchSerper(
  query: string,
  apiKey: string,
  abortSignal?: AbortSignal
): Promise<Array<{ title: string; url: string; snippet: string; engine: SearchResult["engine"] }>> {
  if (isCircuitOpen("serper")) return [];
  await serperLimiter.acquire();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), 7000);
  let resp: Response;
  try {
    resp = await multiKeyFetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: query.slice(0, 120),
        gl: "in",
        hl: "en",
        num: 10,
        tbs: "qdr:y",
      }),
      signal: controller.signal,
    });
  } finally {
    abortSignal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    recordEngineFailure("serper");
    throw new Error(`Serper HTTP ${resp.status}`);
  }
  recordEngineSuccess("serper");

  const data = await resp.json() as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  return (data.organic ?? []).map(r => ({
    title:   r.title   ?? "",
    url:     r.link    ?? "",
    snippet: r.snippet ?? "",
    engine:  "serper" as const,
  })).filter(r => r.url);
}

async function _fetchExa(
  query: string,
  apiKey: string,
  deep = false,
  abortSignal?: AbortSignal
): Promise<RawSearchResult[]> {
  if (isCircuitOpen("exa")) return [];
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), 8000);
  let resp: Response;
  try {
    resp = await multiKeyFetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: query.slice(0, 240),
        numResults: deep ? 15 : 8,
        type: deep ? "neural" : "auto",
      }),
      signal: controller.signal,
    });
  } finally {
    abortSignal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    recordEngineFailure("exa");
    throw new Error(`Exa HTTP ${resp.status}`);
  }
  recordEngineSuccess("exa");

  const data = await resp.json() as {
    results?: Array<{ title?: string; url?: string; text?: string; snippet?: string; publishedDate?: string; score?: number }>;
  };

  return (data.results ?? []).map(r => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.text ?? r.snippet ?? "",
    engine: "exa" as const,
    publishedDate: r.publishedDate,
  })).filter(r => r.url);
}

async function _fetchBrave(
  query: string,
  apiKey: string,
  _deep = false,
  abortSignal?: AbortSignal
): Promise<RawSearchResult[]> {
  if (isCircuitOpen("brave")) return [];
  await braveLimiter.acquire();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), 7000);
  const params = new URLSearchParams({
    q:               query.slice(0, 150),
    count:           "15",
    country:         "IN",
    search_lang:     "en",
    extra_snippets:  "true",
    freshness:       "py",
    result_filter:   "web",
    spellcheck:      "false",
  });
  let resp: Response;
  try {
    resp = await multiKeyFetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });
  } finally {
    abortSignal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    recordEngineFailure("brave");
    throw new Error(`Brave HTTP ${resp.status}`);
  }
  recordEngineSuccess("brave");

  const data = await resp.json() as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string; extra_snippets?: string[] }> };
  };

  return (data.web?.results ?? []).map(r => ({
    title:         r.title ?? "",
    url:           r.url ?? "",
    snippet:       [r.description, ...(r.extra_snippets ?? [])].filter(Boolean).join(" ").slice(0, 1200),
    engine:        "brave" as const,
    publishedDate: (r as any).age ?? (r as any).page_age ?? undefined,
  })).filter(r => r.url);
}

async function _fetchDdgInstant(
  query: string,
  abortSignal?: AbortSignal
): Promise<Array<{ title: string; url: string; snippet: string; engine: SearchResult["engine"] }>> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), 5000);

  let resp: Response;
  try {
    resp = await fetch(url, { signal: controller.signal });
  } finally {
    abortSignal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }

  if (!resp.ok) throw new Error(`DDG Instant ${resp.status}`);

  const data = await resp.json() as {
    AbstractURL?: string;
    Heading?: string;
    Abstract?: string;
    RelatedTopics?: Array<{ FirstURL?: string; Text?: string }>;
  };

  const results: Array<{ title: string; url: string; snippet: string; engine: SearchResult["engine"] }> = [];

  if (data.AbstractURL?.startsWith("http")) {
    results.push({
      title:   data.Heading ?? query,
      url:     data.AbstractURL,
      snippet: data.Abstract ?? "",
      engine:  "ddg_instant",
    });
  }

  for (const t of data.RelatedTopics ?? []) {
    if (t.FirstURL?.startsWith("http")) {
      results.push({
        title:   (t.Text ?? "").slice(0, 80),
        url:     t.FirstURL,
        snippet: t.Text ?? "",
        engine:  "ddg_instant",
      });
    }
  }

  return results;
}

/**
 * Deduplicate an array of SearchResults by canonical URL.
 * Exported for use in the orchestration layer.
 */
export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    const key = canonicalizeUrl(r.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
