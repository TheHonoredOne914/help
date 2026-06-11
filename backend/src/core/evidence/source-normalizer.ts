import type { SourceBucketId } from "../retrieval/source-buckets.js";
import { computeCitationStrength, hasSubstantiveFacts } from "./citation-strength-filter.js";
import type { CompleteEvidenceSourceInput, EvidenceSourceInput, ExtractionQuality, RawEvidenceSourceInput, SourceClass, TopChunk } from "./evidence-registry-types.js";

export function normalizeEvidenceSourceInput(raw: RawEvidenceSourceInput): EvidenceSourceInput | null {
  if (!raw.url || !raw.title) return null;
  const domain = raw.domain ?? domainFromUrl(raw.url);
  const domainClass = classFromDomain(domain);
  const sourceClass = (domainClass === "social_media" || domainClass === "low_quality" ? domainClass : raw.sourceClass ?? domainClass) as SourceClass;
  const authorityScore = normalizeAuthorityScore(raw.authorityScore ?? scoreFromClass(sourceClass));
  const extractionQuality = normalizeExtractionQuality(raw);
  const text = [raw.snippet, raw.fullText, raw.excerpt].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ");
  const keyFacts = raw.keyFacts?.length ? raw.keyFacts : inferKeyFacts(text, raw.title);
  const keyNumbers = raw.keyNumbers?.length ? raw.keyNumbers : extractNumbers(text);
  const legalHoldings = raw.legalHoldings?.length ? raw.legalHoldings : inferLegalHoldings(sourceClass, text);
  const limitations = raw.limitations?.length ? raw.limitations : inferLimitations(raw, text, extractionQuality, authorityScore);
  const topChunks = normalizeTopChunks(raw);
  const titleOnlyFacts = keyFacts.length > 0 && keyFacts.every((fact) => /^title-only relevance:/i.test(fact.trim()));
  const hasText = text.trim().length > 0;
  const limitedSource = Boolean(raw.limitedSource ?? ((!raw.fullText && !raw.excerpt) || extractionQuality === "snippet" || extractionQuality === "failed"));
  const citationEligible = Boolean(raw.citationEligible ?? true)
    && extractionQuality !== "failed"
    && authorityScore >= 65
    && hasText
    && !(titleOnlyFacts && text.trim().length < 160);
  const base: CompleteEvidenceSourceInput = {
    title: raw.title,
    url: raw.url,
    canonicalUrl: canonicalizeUrl(raw.canonicalUrl ?? raw.url),
    domain,
    bucketIds: ((raw.bucketIds?.length ? raw.bucketIds : bucketsFromClassAndDomain(sourceClass, domain)) ?? []) as SourceBucketId[],
    sourceClass,
    authorityScore,
    date: raw.date ?? null,
    fullText: raw.fullText ?? raw.excerpt ?? null,
    snippet: raw.snippet ?? raw.excerpt ?? null,
    extractionQuality,
    discoveredBy: Array.isArray(raw.discoveredBy) ? raw.discoveredBy : undefined,
    extractedBy: typeof raw.extractionProvider === "string" ? raw.extractionProvider : typeof raw.extractedBy === "string" ? raw.extractedBy : undefined,
    fallbackExtractionUsed: raw.fallbackExtractionUsed ?? (raw.extractionProvider === "snippet_fallback" || extractionQuality === "snippet"),
    keyFacts,
    keyNumbers,
    legalHoldings,
    namedEntities: raw.namedEntities ?? [],
    limitations,
    confidence: raw.confidence ?? (hasSubstantiveFacts(keyFacts) ? "high" : "low"),
    citationEligible,
    enrichmentCard: raw.enrichmentCard,
    topChunks,
    limitedSource,
    citationStrength: "ineligible",
  };
  return {
    ...base,
    citationStrength: computeCitationStrength(base),
  };
}

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|fbclid|gclid|mc_cid/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hostname = parsed.hostname.replace(/^m\./, "").replace(/^amp\./, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

function normalizeExtractionQuality(raw: RawEvidenceSourceInput): ExtractionQuality {
  if (raw.extractionQuality === "failed" || raw.extractionStatus === "failed" || raw.extractionMethod === "failed") return "failed";
  if (raw.extractionQuality === "full" || raw.extractionQuality === "partial" || raw.extractionQuality === "snippet") return raw.extractionQuality;
  if (raw.extractionQuality === "high") return raw.fullText ? "full" : raw.excerpt ? "partial" : raw.snippet ? "snippet" : "failed";
  if (raw.extractionQuality === "medium") return raw.fullText || raw.excerpt ? "partial" : raw.snippet ? "snippet" : "failed";
  if (raw.extractionQuality === "low") return raw.snippet || raw.excerpt || raw.fullText ? "snippet" : "failed";
  if (raw.fullText?.trim()) return "full";
  if (raw.excerpt?.trim()) return "partial";
  if (raw.snippet?.trim()) return "snippet";
  return "failed";
}

function normalizeTopChunks(raw: RawEvidenceSourceInput): TopChunk[] {
  const fromSourceChunks = raw.sourceChunks?.map((chunk, index) => ({
    text: String(chunk.text ?? "").trim(),
    score: Number(chunk.relevanceScore ?? chunk.score ?? 0),
    chunkIndex: Number(chunk.index ?? chunk.chunkIndex ?? index),
    sourceId: raw.id,
  })).filter((chunk) => chunk.text.length > 0) ?? [];
  const cardTopChunks = Array.isArray(raw.enrichmentCard?.topChunks)
    ? (raw.enrichmentCard.topChunks as unknown[])
    : [];
  const fromCard = cardTopChunks.map((chunk, index) => ({
    text: typeof chunk === "string" ? chunk.trim() : "",
    score: Number(raw.enrichmentCard?.relevanceScore ?? 0),
    chunkIndex: index,
    sourceId: raw.id,
  })).filter((chunk) => chunk.text.length > 0);
  const fromRaw = raw.topChunks?.map((chunk) => ({
    text: chunk.text.trim(),
    score: Number.isFinite(chunk.score) ? chunk.score : 0,
    chunkIndex: Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex : 0,
    sourceId: chunk.sourceId ?? raw.id,
  })).filter((chunk) => chunk.text.length > 0) ?? [];
  return mergeTopChunks([...fromRaw, ...fromSourceChunks, ...fromCard]);
}

function mergeTopChunks(chunks: TopChunk[]): TopChunk[] {
  const seen = new Set<string>();
  const merged: TopChunk[] = [];
  for (const chunk of chunks.sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)) {
    const key = `${chunk.chunkIndex}:${chunk.text.slice(0, 120).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(chunk);
  }
  return merged.slice(0, 12);
}

function normalizeAuthorityScore(score: number): number {
  const normalized = score > 0 && score <= 10 ? score * 10 : score;
  return Math.max(0, Math.min(100, normalized));
}

function inferKeyFacts(text: string, title: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 24)
    .slice(0, 3);
  if (sentences.length > 0) return sentences;
  return title.trim() ? [`Title-only relevance: ${title.trim()}`] : [];
}

function extractNumbers(text: string): string[] {
  return [...new Set(text.match(/\b20\d{2}\b|\b\d+(?:\.\d+)?%|\b\d+(?:,\d{3})+\b/g) ?? [])].slice(0, 5);
}

function inferLegalHoldings(sourceClass: SourceClass, text: string): string[] {
  if (!["court_primary", "legal_commentary"].includes(sourceClass)) return [];
  const holding = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).find((part) => /held|court|judg|bench|constitutional|article|section/i.test(part));
  return holding ? [holding.slice(0, 280)] : [];
}

function inferLimitations(raw: RawEvidenceSourceInput, text: string, extractionQuality: ExtractionQuality, authorityScore: number): string[] {
  const limitations: string[] = [];
  if (!raw.fullText && (raw.snippet || raw.excerpt)) limitations.push("Limited extraction; verify fine-grained claims before heavy use.");
  if (extractionQuality === "failed") limitations.push("Extraction failed.");
  if (!text.trim()) limitations.push("No extractable source text was available.");
  if (authorityScore < 65) limitations.push("Weak relevance or lower authority.");
  return limitations;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function classFromDomain(domain: string): SourceClass {
  if (/facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|youtu\.be|linkedin\.com/.test(domain)) return "social_media";
  if (/wikipedia\.org/.test(domain)) return "low_quality";
  if (/sci\.gov\.in|api\.sci\.gov\.in|main\.sci\.gov\.in|highcourt\.nic\.in|highcourt\.gov\.in|hcmadras\.tn\.gov\.in|bombayhighcourt\.nic\.in/.test(domain)) return "court_primary";
  if (/indiankanoon|scobserver|scconline|livelaw|barandbench|manupatra|lexisnexis/.test(domain)) return "legal_commentary";
  if (/sansad\.in|loksabha\.nic\.in|rajyasabha\.nic\.in/.test(domain)) return "parliamentary_records";
  if (/mha\.gov\.in|pib\.gov\.in|fcraonline|ncrb\.gov\.in|data\.gov\.in|rtionline\.gov\.in|mpa\.gov\.in|egazette\.nic\.in|education\.gov\.in|ugc\.gov\.in|deb\.ugc\.ac\.in|aicte-india\.org|aishe\.gov\.in|swayam\.gov\.in|nad\.gov\.in/.test(domain)) return "official_government";
  if (/prsindia/.test(domain)) return "policy_research";
  if (/eci\.gov\.in|adrindia/.test(domain)) return "electoral_body";
  if (/freedomhouse|v-dem|eiu|idea\.int|ipu\.org/.test(domain)) return "democracy_index";
  if (/hrw|amnesty|ohchr/.test(domain)) return "human_rights_watchdog";
  if (/civicus/.test(domain)) return "civic_space_monitor";
  if (/accessnow|internetshutdowns|internetfreedom|sflc/.test(domain)) return "digital_rights_watchdog";
  if (/rsf|cpj/.test(domain)) return "press_freedom_index";
  if (/epw|cambridge|jstor|sagepub|oup|nluj\.ac\.in|nlsiu\.ac\.in|nliu\.ac\.in/.test(domain)) return "academic_journal";
  if (/thehindu|indianexpress|article-14|scroll|thewire|ndtv|timesofindia|livemint|businessstandard|altnews|boomlive|factchecker/.test(domain)) return "indian_major_media";
  return "general_media";
}

function bucketsFromClassAndDomain(sourceClass: SourceClass, domain: string): SourceBucketId[] {
  const byClass: Record<SourceClass, SourceBucketId[]> = {
    court_primary: ["court_legal"],
    official_government: ["government_official"],
    parliamentary_records: ["parliamentary_records", "government_official"],
    electoral_body: ["electoral_integrity", "government_official"],
    democracy_index: ["democracy_index"],
    civic_space_monitor: ["civic_space"],
    human_rights_watchdog: ["human_rights_watchdog"],
    digital_rights_watchdog: ["digital_rights"],
    press_freedom_index: ["press_freedom"],
    academic_journal: ["academic_research"],
    legal_commentary: ["legal_commentary", "court_legal"],
    indian_major_media: ["indian_major_media"],
    policy_research: ["policy_research"],
    comparative_democracy: ["comparative_democracy"],
    general_media: [],
    social_media: [],
    low_quality: [],
  };
  const buckets = [...byClass[sourceClass]];
  if (/prsindia|sansad/.test(domain)) buckets.push("parliamentary_records");
  if (/v-dem|idea|freedomhouse/.test(domain) && !buckets.includes("comparative_democracy")) buckets.push("comparative_democracy");
  if (/eci|adrindia/.test(domain) && !buckets.includes("electoral_integrity")) buckets.push("electoral_integrity");
  return [...new Set(buckets)];
}

function scoreFromClass(sourceClass: SourceClass): number {
  const scores: Record<SourceClass, number> = {
    court_primary: 98,
    official_government: 94,
    parliamentary_records: 94,
    electoral_body: 95,
    democracy_index: 94,
    civic_space_monitor: 91,
    human_rights_watchdog: 91,
    digital_rights_watchdog: 90,
    press_freedom_index: 90,
    academic_journal: 88,
    legal_commentary: 84,
    indian_major_media: 82,
    policy_research: 76,
    comparative_democracy: 86,
    general_media: 60,
    social_media: 15,
    low_quality: 20,
  };
  return scores[sourceClass];
}
