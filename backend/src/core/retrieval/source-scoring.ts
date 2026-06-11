import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { SourceClass } from "../evidence/evidence-registry.js";

export interface ScoreableSource {
  url: string;
  title: string;
  snippet?: string;
  publishedDate?: string | null;
  bucketIds?: string[];
}

export interface SourceScore {
  score: number;
  sourceClass: SourceClass;
  reasons: string[];
}

export function scoreSourceForAgenda(source: ScoreableSource, contract: AgendaContract): SourceScore {
  const domain = domainFromUrl(source.url);
  const text = `${source.title} ${source.snippet ?? ""} ${source.url}`.toLowerCase();
  const sourceClass = classifySource(domain);
  const reasons: string[] = [];
  let score = authorityScore(sourceClass, domain);

  if (text.includes("india") || text.includes("indian")) {
    score += 6;
    reasons.push("India relevance");
  }
  if (contract.requiredEntities.some((entity) => text.includes(entity.toLowerCase()))) {
    score += 8;
    reasons.push("required entity match");
  }
  if (source.publishedDate && contract.temporalScope.startYear && contract.temporalScope.endYear) {
    const year = Number(source.publishedDate.match(/\b(20\d{2})\b/)?.[1]);
    if (year >= contract.temporalScope.startYear && year <= contract.temporalScope.endYear) {
      score += contract.temporalScope.explicit ? 4 : 9;
      reasons.push("date in scope");
    }
  }
  if (contract.forbiddenDriftTerms.some((term) => text.includes(term.toLowerCase()))) {
    score -= 50;
    reasons.push("agenda drift penalty");
  }
  if (sourceClass === "social_media") {
    score -= 35;
    reasons.push("social media does not count as official evidence");
  }
  if (/quora|reddit|medium|byjus|toppr|blogspot|wordpress/.test(domain)) {
    score -= 55;
    reasons.push("low-quality domain penalty");
  }
  if (!source.snippet || source.snippet.length < 80) {
    const primaryOrIndexSource = [
      "court_primary",
      "electoral_body",
      "parliamentary_records",
      "official_government",
      "democracy_index",
    ].includes(sourceClass);
    score -= primaryOrIndexSource ? 6 : 18;
    reasons.push(primaryOrIndexSource ? "short official/index snippet penalty" : "snippet-only penalty");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), sourceClass, reasons };
}

export function classifySource(domain: string): SourceClass {
  if (/facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|youtu\.be|linkedin\.com/.test(domain)) return "social_media";
  if (/wikipedia\.org/.test(domain)) return "low_quality";
  if (/sci\.gov\.in|api\.sci\.gov\.in|main\.sci\.gov\.in/.test(domain)) return "court_primary";
  if (/highcourt\.nic\.in|highcourt\.gov\.in|hcmadras\.tn\.gov\.in|bombayhighcourt\.nic\.in/.test(domain)) return "court_primary";
  if (/eci\.gov\.in|adrindia\.org/.test(domain)) return "electoral_body";
  if (/sansad\.in|loksabha\.nic\.in|rajyasabha\.nic\.in/.test(domain)) return "parliamentary_records";
  if (/mha\.gov\.in|pib\.gov\.in|fcraonline\.nic\.in|ncrb\.gov\.in|data\.gov\.in|rtionline\.gov\.in|mpa\.gov\.in|egazette\.nic\.in|education\.gov\.in|ugc\.gov\.in|deb\.ugc\.ac\.in|aicte-india\.org|aishe\.gov\.in|swayam\.gov\.in|nad\.gov\.in|\.gov\.in$|\.nic\.in$/.test(domain)) return "official_government";
  if (/prsindia\.org/.test(domain)) return "policy_research";
  if (/freedomhouse\.org|v-dem\.net|eiu\.com|economist\.com|idea\.int|ipu\.org/.test(domain)) return "democracy_index";
  if (/hrw\.org|amnesty\.org|ohchr\.org/.test(domain)) return "human_rights_watchdog";
  if (/civicus/.test(domain)) return "civic_space_monitor";
  if (/accessnow\.org|internetshutdowns\.in|sflc\.in|internetfreedom\.in/.test(domain)) return "digital_rights_watchdog";
  if (/rsf\.org|cpj\.org/.test(domain)) return "press_freedom_index";
  if (/epw\.in|cambridge\.org|jstor\.org|sagepub\.com|oup\.com|academic\.oup\.com|nluj\.ac\.in|nlsiu\.ac\.in|nliu\.ac\.in/.test(domain)) return "academic_journal";
  if (/scobserver\.in|scconline\.com|livelaw\.in|barandbench\.com|indiankanoon\.org|manupatra\.com|lexisnexis\.in|lawbeat\.in/.test(domain)) return "legal_commentary";
  if (/thehindu\.com|indianexpress\.com|newindianexpress\.com|article-14\.com|scroll\.in|thewire\.in|hindustantimes\.com|ndtv\.com|timesofindia\.com|livemint\.com|businessstandard\.com|theprint\.in|deccanherald\.com|altnews\.in|boomlive\.in|factchecker\.in/.test(domain)) return "indian_major_media";
  if (/brookings\.edu|carnegieendowment\.org|orfonline\.org|cprindia\.org|chathamhouse\.org/.test(domain)) return "policy_research";
  if (/quora|reddit|medium|byjus|toppr|blogspot|wordpress|wikipedia/.test(domain)) return "low_quality";
  return "general_media";
}

function authorityScore(sourceClass: SourceClass, domain: string): number {
  if (sourceClass === "court_primary") return 98;
  if (sourceClass === "electoral_body") return 95;
  if (sourceClass === "parliamentary_records") return 94;
  if (sourceClass === "official_government") return 92;
  if (sourceClass === "democracy_index") return 92;
  if (["human_rights_watchdog", "civic_space_monitor", "press_freedom_index", "digital_rights_watchdog"].includes(sourceClass)) return 88;
  if (sourceClass === "academic_journal") return 84;
  if (sourceClass === "legal_commentary") return 82;
  if (sourceClass === "indian_major_media") return 78;
  if (sourceClass === "social_media") return 15;
  if (sourceClass === "low_quality") return 10;
  if (/\.gov\.in$/.test(domain)) return 88;
  if (sourceClass === "general_media") return 60;
  return 62;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
