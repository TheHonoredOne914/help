import type { AgendaContract } from "../../agenda/agenda-contract.js";

const PROMPT_WORDS = new Set([
  "analyze", "analysis", "prepare", "write", "generate", "brief", "research", "make", "give",
  "sources", "source", "using", "with", "from", "about", "into", "that", "this", "please",
  "arguments", "argument", "style", "deep", "level", "detailed", "quick", "latest",
  "fast", "mock", "parliamentary", "debate", "aippm",
  "treasury", "bench", "opposition", "produce", "least", "words", "word", "use", "pois",
  "rebuttals", "motions", "amendments", "recommendations", "retrieved", "cite",
  "only", "final", "answer", "should",
]);

const IMPORTANT_PHRASES = [
  /Article\s+\d+[A-Z]?/gi,
  /Supreme Court/gi,
  /Election Commission/gi,
  /Union Government/gi,
  /online political advertising/gi,
  /deepfakes?/gi,
  /platform transparency/gi,
  /Lok Sabha/gi,
  /Rajya Sabha/gi,
  /Vidhan Sabha/gi,
  /Treasury Bench/gi,
  /constitutional challenge/gi,
  /public order/gi,
  /national security/gi,
  /food security/gi,
  /water security/gi,
  /digital commerce/gi,
  /AI governance/gi,
  /data protection/gi,
  /gig workers?/gi,
];

export function extractAgendaKeywords(contract: AgendaContract, maxTerms = 12): string {
  const text = [
    topicTextForSearch(contract.normalizedAgenda),
    ...contract.requiredEntities,
    contract.countryFocus ?? "",
  ].join(" ");
  const phrases = IMPORTANT_PHRASES.flatMap((pattern) => text.match(pattern) ?? []);
  const acronyms = text.match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? [];
  const years = text.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  const words = text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => !PROMPT_WORDS.has(word.toLowerCase()));
  const selected = uniquePreserveCase([...phrases, ...acronyms, ...years, ...words])
    .filter((term) => term.length > 0)
    .slice(0, maxTerms);

  if (selected.length > 0) return selected.join(" ");
  const fallbackSubject = topicTextForSearch(contract.normalizedAgenda);
  if (fallbackSubject.trim()) return fallbackSubject.trim().slice(0, 120);
  return "India Parliament";
}

export function compactAgendaSubject(contract: AgendaContract): string {
  return extractAgendaKeywords(contract, 8)
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeQueryWhitespace(query: string): string {
  return query
    .replace(/\b(20\d{2})(?:\s+\1)+\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function uniquePreserveCase(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function topicTextForSearch(agenda: string): string {
  const normalized = agenda.replace(/\s+/g, " ").trim();
  const explicitQuestion = normalized.match(/\b(?:should|whether|how should|to what extent)\b[^?]{20,260}\?/i)?.[0];
  const subject = explicitQuestion ?? normalized;
  return subject
    .replace(/^\s*(?:fast|deep)?\s*research\s+(?:for|on)\s+(?:an?\s+)?(?:aippm|lok sabha|rajya sabha|vidhan sabha|mock parliament|indian mock parliament)?\s*(?:debate)?\s*(?:in\s+india)?\s*:?\s*/i, "")
    .replace(/\bproduce\s+at\s+least\b.*$/i, "")
    .replace(/\buse\s+indian\s+parliamentary\s+framing\b.*$/i, "")
    .replace(/\bwith\s+treasury\s+bench\b.*$/i, "")
    .replace(/\bfor\s+indian\s+mock\s+parliament\s+use\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
