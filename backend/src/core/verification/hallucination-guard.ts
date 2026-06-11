import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import { extractArticleMentions, extractCaseMentions, KNOWN_VALID_ARTICLES } from "./legal-claim-validator.js";

export interface HallucinationGuardReport {
  passed: boolean;
  issues: HallucinationIssue[];
  autoRepairableIssues: HallucinationIssue[];
  criticalIssues: HallucinationIssue[];
  repairedText?: string;
}

export interface HallucinationIssue {
  type: string;
  evidence: string;
  severity: "warning" | "critical";
  repairHint: string;
}

export type GuardReport = HallucinationGuardReport;

export function runHallucinationGuard(text: string, registry: EvidenceRegistryCore): HallucinationGuardReport {
  const issues: HallucinationIssue[] = [];
  const registryText = registry.sources.map((source) => `${source.id} ${source.title} ${source.url} ${source.snippet ?? ""} ${source.fullText ?? ""} ${source.legalHoldings.join(" ")} ${source.keyNumbers.join(" ")}`).join("\n");

  for (const match of text.matchAll(/\[Source\s+(\d+)\]\((https?:\/\/[^)]+)\)/gi)) {
    const sourceId = Number(match[1]);
    const source = registry.getSource(sourceId);
    if (!source) {
      issues.push(issue("invalid_citation", match[0], "critical", "Remove the fake citation or replace it with an existing registry source."));
      continue;
    }
    if (domain(source.url) !== domain(match[2])) {
      issues.push(issue("citation_url_mismatch", match[0], "critical", "Use the exact URL for the cited registry source."));
    }
  }
  for (const match of text.matchAll(/\[Source\s+(\d+)\](?!\()/gi)) {
    issues.push(issue("bare_citation", match[0], "critical", "Repair bare citations to linked [Source N](URL) citations or reject them."));
  }
  for (const article of extractArticleMentions(text)) {
    if (!KNOWN_VALID_ARTICLES.has(article)) {
      issues.push(issue("fake_article", `Article ${article}`, "critical", "Remove or correct the constitutional Article reference."));
    }
    if (!sourceSupportsArticle(registry, article)) {
      issues.push(issue("ungrounded_article", `Article ${article}`, "warning", "Cite a legal or official source near the Article claim."));
    }
  }
  for (const caseName of extractCaseMentions(text)) {
    if (!normalize(registryText).includes(normalize(caseName))) {
      issues.push(issue("ungrounded_case", caseName, "warning", "Qualify the case reference or cite a source where it appears."));
    }
  }
  for (const holding of extractLegalHoldings(text)) {
    if (!normalize(registryText).includes(normalize(holding))) {
      issues.push(issue("unsupported_legal_holding", holding, "critical", "Remove unsupported holdings or tie them to a court/legal source in the registry."));
    }
  }
  for (const number of extractNumbers(text)) {
    if (!numberIsSupported(registry, number)) {
      issues.push(issue("unsupported_statistic", number, "warning", "Only use rankings, totals, and percentages that appear in registry text or keyNumbers."));
    }
  }
  if (/\bmember states\b|\bSecurity Council\b|\bGeneral Assembly\b|\bUN resolution\b|\bECOSOC\b|\bbloc politics\b|\bP5\b|\bUNSC\b/i.test(text)) {
    issues.push(issue("un_framing", "UN-style framing", "critical", "Replace UN framing with Indian parliamentary framing."));
  }
  if (/(?<!allegations of )\b(?:fraud happened|election was stolen|evms? were (manipulated|hacked)|autocracy|election-rigging)\b/i.test(text)) {
    issues.push(issue("overclaim", "absolute electoral or regime claim", "critical", "Frame as allegation, judicial record, ECI defence, or evidence threshold."));
  }

  return {
    passed: issues.filter((item) => item.severity === "critical").length === 0,
    issues,
    autoRepairableIssues: issues.filter((item) => ["bare_citation", "un_framing", "overclaim"].includes(item.type)),
    criticalIssues: issues.filter((item) => item.severity === "critical"),
    repairedText: text,
  };
}

function issue(type: string, evidence: string, severity: HallucinationIssue["severity"], repairHint: string): HallucinationIssue {
  return { type, evidence, severity, repairHint };
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractNumbers(text: string): string[] {
  return [...new Set([
    ...([...text.matchAll(/\b\d+(?:\.\d+)?%/g)].map((match) => match[0])),
    ...([...text.matchAll(/\b\d+(?:st|nd|rd|th)\s+out\s+of\s+\d+\b/gi)].map((match) => match[0])),
  ])];
}

function extractLegalHoldings(text: string): string[] {
  return [...new Set([...text.matchAll(/\bheld\s+that\s+([^.!?]{16,180})/gi)].map((match) => match[1].trim()))];
}

function sourceSupportsArticle(registry: EvidenceRegistryCore, article: string): boolean {
  const articlePattern = new RegExp(`\\b(?:Article\\s+)?${escapeRegExp(article)}\\b`, "i");
  return registry.sources.some((source) => {
    if (!source.citationEligible) return false;
    if (!["court_primary", "legal_commentary", "official_government", "parliamentary_records"].includes(source.sourceClass)) return false;
    return articlePattern.test(sourceText(source));
  });
}

function numberIsSupported(registry: EvidenceRegistryCore, number: string): boolean {
  const target = normalizeNumber(number);
  if (!target) return false;
  return registry.sources.some((source) => {
    if (!source.citationEligible) return false;
    return source.keyNumbers.some((candidate) => normalizeNumber(candidate) === target)
      || exactNumberInText(sourceText(source), number);
  });
}

function sourceText(source: EvidenceRegistryCore["sources"][number]): string {
  return [
    source.title,
    source.snippet ?? "",
    source.fullText ?? "",
    source.keyFacts.join(" "),
    source.keyNumbers.join(" "),
    source.legalHoldings.join(" "),
  ].join(" ");
}

function normalizeNumber(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/,/g, "");
  const percentage = trimmed.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentage) return `${Number(percentage[1])}%`;
  const ordinal = trimmed.match(/^(\d+)(?:st|nd|rd|th)\s+out\s+of\s+(\d+)$/);
  if (ordinal) return `${Number(ordinal[1])}/${Number(ordinal[2])}`;
  const plain = trimmed.match(/^\d+(?:\.\d+)?$/);
  return plain ? String(Number(trimmed)) : trimmed;
}

function exactNumberInText(text: string, number: string): boolean {
  const escaped = escapeRegExp(number.replace(/,/g, ""));
  const compactText = text.replace(/,/g, "");
  return new RegExp(`(^|[^\\d.])${escaped}([^\\d.]|$)`).test(compactText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
