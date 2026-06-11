import type { AgendaContract } from "../agenda/agenda-contract.js";
import { scoreSourceForAgenda, type ScoreableSource } from "./source-scoring.js";

export interface SourceRejection {
  source: ScoreableSource;
  reason: "invalid_url" | "blocked_domain" | "forbidden_drift" | "low_score" | "india_relevance";
  detail: string;
}

export interface FilterResult<T extends ScoreableSource> {
  kept: T[];
  rejected: SourceRejection[];
}

export function filterSourcesForAgenda<T extends ScoreableSource>(sources: T[], contract: AgendaContract): T[];
export function filterSourcesForAgenda<T extends ScoreableSource>(sources: T[], contract: AgendaContract, options: { withReasons: true }): FilterResult<T>;
export function filterSourcesForAgenda<T extends ScoreableSource>(sources: T[], contract: AgendaContract, options?: { withReasons?: boolean }): T[] | FilterResult<T> {
  const kept: T[] = [];
  const rejected: SourceRejection[] = [];

  for (const source of sources) {
    const text = `${source.title} ${source.snippet ?? ""} ${source.url}`.toLowerCase();
    const urlInfo = parseHttpUrl(source.url);
    if (!urlInfo.valid) {
      rejected.push({ source, reason: "invalid_url", detail: `Malformed or unsupported URL: ${source.url}` });
      continue;
    }
    const domain = urlInfo.domain;
    if (/quora\.com|reddit\.com|medium\.com|byjus\.com|toppr\.com|blogspot|wordpress/.test(domain)) {
      rejected.push({ source, reason: "blocked_domain", detail: `Domain ${domain} is blocked.` });
      continue;
    }
    const driftMatch = contract.forbiddenDriftTerms.find((term) => text.includes(term.toLowerCase()));
    if (driftMatch) {
      rejected.push({ source, reason: "forbidden_drift", detail: `Forbidden drift term matched: ${driftMatch}` });
      continue;
    }
    const score = scoreSourceForAgenda(source, contract);
    if (score.score < 40) {
      rejected.push({ source, reason: "low_score", detail: `Score ${score.score} below minimum 40.` });
      continue;
    }
    if (contract.countryFocus === "India") {
      const indiaRelevant = hasIndiaRelevance(text, domain);
      if (!indiaRelevant && score.score < 70) {
        rejected.push({ source, reason: "india_relevance", detail: `India relevance too low (score ${score.score}).` });
        continue;
      }
    }
    kept.push(source);
  }

  if (options?.withReasons) return { kept, rejected };
  return kept;
}

function parseHttpUrl(url: string): { valid: true; domain: string } | { valid: false; domain: "" } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { valid: false, domain: "" };
    return { valid: true, domain: parsed.hostname.replace(/^www\./, "").toLowerCase() };
  } catch {
    return { valid: false, domain: "" };
  }
}

function hasIndiaRelevance(text: string, domain: string): boolean {
  if (/\b(pib|mea|mha|nhrc|ncrb|cag|mpa|eci|rbi|mospi)\.gov\.in\b|\.nic\.in\b|\.gov\.in\b|prsindia\.org|sansad\.in|loksabha\.nic\.in|rajyasabha\.nic\.in|sci\.gov\.in|indiankanoon\.org|data\.gov\.in/.test(domain)) {
    return true;
  }
  if (/\b(india|indian|new delhi|delhi|lok sabha|rajya sabha|sansad|parliament of india|supreme court of india|election commission of india|constitution of india|article \d+|union ministry|vidhan sabha|aippm)\b/.test(text)) {
    return true;
  }
  if (/\b(modi|bjp|congress|aap|gandhi|nehru|patel|ambedkar)\b/.test(text)) {
    return /\b(india|indian|parliament|supreme court|constitution|ministry|lok sabha|rajya sabha|election commission|vidhan sabha)\b/.test(text);
  }
  return false;
}
