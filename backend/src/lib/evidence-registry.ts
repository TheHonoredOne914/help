import type { Division } from "./division-framework.js";
import { buildAgendaContract } from "../core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceRegistryCore } from "../core/evidence/evidence-registry.js";
import { canonicalizeUrl, detectSourceConflicts } from "./rag.js";
import { deduplicatePassagesSemantically, semanticChunkDocument, type Passage } from "./passage-engine.js";
import { estimateTokens, resolveModelProfile, type ModelCapabilityProfile } from "./token-budget.js";
import type { DimensionEngineOutput, DimensionName, EnrichedResult, EvidenceRegistry, NumberedSource } from "./types.js";

export function buildEvidenceRegistry(
  enrichedResults: EnrichedResult[],
  agendaText: string,
): EvidenceRegistry {
  // TODO Brick 13: This is the legacy registry path. Migrate callers to
  // EvidenceRegistryCore (core/evidence/evidence-registry.ts). Track: BRICK-13-LEGACY
  const sources: NumberedSource[] = enrichedResults.map((result, index) => ({
    index: index + 1,
    title: result.title,
    url: result.url,
    canonicalUrl: canonicalizeUrl(result.url),
    sourceType: result.sourceType,
    tier: classifySourceToTier(result),
    hasFullContent: ((result.content || "").trim().length) > 200,
    snippet: result.snippet,
    content: result.content || result.snippet || "",
    judgement: result.judgement,
    reportType: result.reportType,
    score: result.score,
    dimensions: inferEvidenceDimensions(result, agendaText),
  }));

  const rawPassages = sources.flatMap((source) =>
    semanticChunkDocument(source.content || source.snippet || "", source.url, {
      sourceIndex: source.index,
      sourceTitle: source.title,
      sourceTier: source.tier,
    }).map((passage) => ({
      ...passage,
      dimensionTags: passage.dimensionTags.length > 0
        ? passage.dimensionTags
        : ((source.dimensions ?? []).filter(isDimensionName) as DimensionName[]),
    }))
  );
  const passages = deduplicatePassagesSemantically(rawPassages);
  const passagesByDimension = buildPassagesByDimension(passages);
  const topEvidencePassages = [...passages]
    .sort((a, b) => combinedPassageScore(b) - combinedPassageScore(a))
    .slice(0, 15);
  const evidenceDensityScore = passages.length > 0
    ? passages.reduce((sum, passage) => sum + passage.evidenceDensityScore, 0) / passages.length
    : 0;

  const registry: EvidenceRegistry = {
    agendaText,
    queryTimestamp: new Date().toISOString(),
    sources,
    passages,
    passagesByDimension,
    topEvidencePassages,
    semanticDuplicateCount: Math.max(0, rawPassages.length - passages.length),
    evidenceDensityScore,
    tier1Sources: sources.filter((s) => s.tier === "tier1"),
    tier2Sources: sources.filter((s) => s.tier === "tier2"),
    tier3Sources: sources.filter((s) => s.tier === "tier3"),
    tier4Sources: sources.filter((s) => s.tier === "tier4"),
    tier5Sources: sources.filter((s) => s.tier === "tier5"),
    courtJudgements: sources
      .filter((s) => s.judgement?.isJudgement)
      .map((source) => ({ source, judgement: source.judgement! })),
    govReports: sources
      .filter((source) => source.reportType)
      .map((source) => ({ source, reportType: source.reportType! })),
    snippetOnlySources: sources.filter((s) => !s.hasFullContent),
    conflictedClaims: detectSourceConflicts(enrichedResults),
    evidenceGaps: detectEvidenceGaps(enrichedResults, agendaText),
  };
  attachCoreEvidenceRegistry(registry, agendaText);
  return registry;
}

export function getCoreEvidenceRegistryBridge(registry: EvidenceRegistry): EvidenceRegistryCore | undefined {
  return (registry as EvidenceRegistry & { coreRegistry?: EvidenceRegistryCore }).coreRegistry;
}

function attachCoreEvidenceRegistry(registry: EvidenceRegistry, agendaText: string): void {
  const contract = buildAgendaContract({ requestId: "legacy-evidence-registry", originalUserQuery: agendaText });
  const coreRegistry = buildEvidenceRegistryFromSources(registry.sources.map((source) => ({
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    domain: domainFromUrl(source.url),
    snippet: source.snippet,
    fullText: source.hasFullContent ? source.content : null,
    excerpt: source.hasFullContent ? undefined : source.content || source.snippet,
    authorityScore: source.score > 0 && source.score <= 1.5 ? source.score * 100 : source.score,
    date: null,
    extractionQuality: source.hasFullContent ? "full" : source.snippet ? "snippet" : "failed",
    keyFacts: source.content || source.snippet ? [source.content || source.snippet].filter(Boolean).map((value) => value.slice(0, 280)) : [],
    keyNumbers: [...new Set(`${source.title} ${source.snippet} ${source.content}`.match(/\b20\d{2}\b|\b\d+(?:\.\d+)?%/g) ?? [])].slice(0, 5),
    legalHoldings: source.judgement?.held ? [source.judgement.held] : [],
    limitations: source.hasFullContent ? [] : ["Legacy registry source is snippet-only or limited content."],
    citationEligible: source.hasFullContent || Boolean(source.snippet?.trim()),
  })), contract);
  Object.defineProperty(registry, "coreRegistry", {
    value: coreRegistry,
    enumerable: false,
    configurable: true,
  });
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function classifySourceToTier(result: EnrichedResult): NumberedSource["tier"] {
  const url = result.url.toLowerCase();
  if (result.sourceType === "court_judgement" || result.judgement?.isJudgement) return "tier1";
  const isDemocracyWatchdog = /freedomhouse\.org|v-dem\.net|civicus\.org|civicusmonitor|idea\.int|hrw\.org|amnesty(international)?\.org|article14\.com|eiu\.com/.test(url);
  if (isDemocracyWatchdog && result.score >= 8) return "tier1";
  if (result.sourceType === "government_india" && (url.includes("cag.gov.in") || url.includes("ncrb.gov.in"))) return "tier2";
  if (url.includes("prsindia.org") || url.includes("sansad.in")) return "tier2";
  if (result.reportType) return "tier2";
  if (url.includes("rbi.org.in") || url.includes("niti.gov.in") || url.includes("mospi.gov.in") || url.includes("censusindia.gov.in")) return "tier3";
  if (url.includes("epw.in") || url.includes("idsa.in") || url.includes("cprindia.org") || url.includes("orfonline.org")) return "tier4";
  if (result.sourceType === "international_research" || result.sourceType === "government_international") return "tier5";
  if (result.sourceType === "government_india") return "tier2";
  return "untiered";
}

export function buildEvidenceBlockForDivision(
  division: Pick<Division, "evidenceTiers" | "id">,
  registry: EvidenceRegistry,
  modelProfile: ModelCapabilityProfile = resolveModelProfile("default"),
  activeDimensions: DimensionName[] = [],
): string {
  const relevantSources = registry.sources.filter((source) => division.evidenceTiers.includes(source.tier));
  const courtBlock = registry.courtJudgements.length > 0
    ? `## COURT JUDGEMENTS [Tier 1 - cite as **Case Name (Year, Court)** - held summary [Source N](url)]\n`
      + registry.courtJudgements.map(({ source, judgement }) =>
        `[Source ${source.index}] **${judgement.caseName}** (${judgement.year}, ${judgement.court}) - ${judgement.held.slice(0, 200)} - ${source.url}`
      ).join("\n") + "\n\n"
    : "";

  const relevantPassages = selectPassagesForDivision(division, registry, activeDimensions);
  const snippetSources = relevantSources.filter((source) => !source.hasFullContent);
  if (modelProfile.isSmallModel) {
    return buildCompressedEvidenceBlock(registry, relevantPassages, activeDimensions);
  }

  let usedTokens = 0;
  const selected: Passage[] = [];
  for (const passage of relevantPassages) {
    const formatted = formatPassage(passage);
    const passageTokens = estimateTokens(formatted);
    if (usedTokens + passageTokens > modelProfile.evidenceTokenBudget) break;
    selected.push(passage);
    usedTokens += passageTokens;
  }

  const passageBlock = selected.length > 0
    ? selected.map((passage) => formatPassage(passage)).join("\n---\n")
    : relevantSources.filter((source) => source.hasFullContent).map((source) => {
      const limit = Math.min(getContentLimit(source.url), Math.floor(modelProfile.evidenceTokenBudget * 3.8));
      const body = (source.content || source.snippet || "").slice(0, limit);
      return `[Source ${source.index}] ${source.title} - ${source.url}\nContent:\n${body}`;
    }).join("\n\n---\n\n");

  const snippetBlock = snippetSources.length > 0
    ? `\n\n## REFERENCE-ONLY SOURCES - SNIPPET ONLY (DO NOT CITE STATISTICS FROM THESE - TITLE/POSITION ONLY)\n`
      + snippetSources.map((source) =>
        `[Source ${source.index}] ${source.title} - ${source.url}\n(Snippet: ${source.snippet?.slice(0, 100) ?? ""})`
      ).join("\n")
    : "";

  const gapWarningBlock = registry.evidenceGaps.length > 0
    ? `\n\n## KNOWN EVIDENCE GAPS (DO NOT INVENT CONTENT FOR THESE - STATE GAP EXPLICITLY):\n`
      + registry.evidenceGaps.map((gap) => `- ${gap}`).join("\n")
    : "";

  return `${courtBlock}${passageBlock}${snippetBlock}${gapWarningBlock}`.trim();
}

export function buildCompressedEvidenceBlock(
  registry: EvidenceRegistry,
  relevantPassages: Passage[] = [],
  activeDimensions: DimensionName[] = [],
): string {
  const candidates = (relevantPassages.length > 0 ? relevantPassages : registry.topEvidencePassages)
    .filter((passage) => passage.evidenceDensityScore > 0.4)
    .filter((passage) => {
      const source = registry.sources.find((item) => item.index === passage.sourceIndex);
      return !!source?.hasFullContent;
    })
    .sort((a, b) => combinedPassageScore(b) - combinedPassageScore(a))
    .slice(0, 10);

  const facts = candidates.map((passage) =>
    `- ${extractFactLine(passage.text)} - Source ${passage.sourceIndex} (${passage.sourceUrl})`
  );

  const courtLines = registry.courtJudgements.slice(0, 5).map(({ source, judgement }) =>
    `- ${judgement.caseName} (${judgement.year}, ${judgement.court}): ${judgement.held.slice(0, 260)} - Source ${source.index}`
  );

  const gapLines = registry.evidenceGaps.map((gap) => `- ${gap}`);
  return [
    "## COMPRESSED EVIDENCE PACK [small-model mode]",
    activeDimensions.length > 0 ? `Dimensions: ${activeDimensions.join(", ")}` : "",
    "",
    "VERIFIED FACTS - cite these with full confidence:",
    facts.length > 0 ? facts.join("\n") : "- No high-density full-content facts retrieved for this division.",
    "",
    "COURT JUDGEMENTS:",
    courtLines.length > 0 ? courtLines.join("\n") : "- No verified court judgement in retrieved sources.",
    "",
    "EVIDENCE GAPS - state these explicitly; do not invent:",
    gapLines.length > 0 ? gapLines.join("\n") : "- No explicit registry gaps.",
  ].filter((line) => line !== "").join("\n");
}

function selectPassagesForDivision(
  division: Pick<Division, "evidenceTiers" | "id">,
  registry: EvidenceRegistry,
  activeDimensions: DimensionName[],
): Passage[] {
  const tierAllowed = new Set(division.evidenceTiers);
  const sourceTierByIndex = new Map(registry.sources.map((source) => [source.index, source.tier]));
  const dimensionFiltered = registry.passages.filter((passage) => {
    const tier = sourceTierByIndex.get(passage.sourceIndex);
    const tierMatch = tier ? tierAllowed.has(tier) : true;
    const dimensionMatch = activeDimensions.length === 0
      || passage.dimensionTags.some((tag) => activeDimensions.includes(tag));
    return tierMatch && dimensionMatch;
  });
  const fallback = dimensionFiltered.length > 0
    ? dimensionFiltered
    : registry.passages.filter((passage) => tierAllowed.has(sourceTierByIndex.get(passage.sourceIndex) ?? "untiered"));
  return [...fallback].sort((a, b) => combinedPassageScore(b) - combinedPassageScore(a));
}

function formatPassage(passage: Passage): string {
  const tierBadge = passage.sourceTier === "tier1" ? "[VERIFIED]"
    : passage.sourceTier === "tier2" ? "[GOVT-INDIA]"
      : passage.sourceTier === "tier3" ? "[GOVT-DATA]"
        : passage.sourceTier === "tier4" ? "[RESEARCH]"
          : passage.sourceTier === "tier5" ? "[INTL]"
            : "[WEB]";
  return [
    `[Source ${passage.sourceIndex}] ${tierBadge} ${passage.sourceTitle}`,
    `URL: ${passage.sourceUrl} | Relevance: ${Math.round(passage.relevanceScore * 100)}% | Density: ${Math.round(passage.evidenceDensityScore * 100)}%`,
    `Excerpt:\n${passage.text}`,
  ].join("\n");
}

function buildPassagesByDimension(passages: Passage[]): Partial<Record<DimensionName, Passage[]>> {
  const grouped: Partial<Record<DimensionName, Passage[]>> = {};
  for (const passage of passages) {
    for (const dimension of passage.dimensionTags) {
      const existing = grouped[dimension] ?? [];
      existing.push(passage);
      grouped[dimension] = existing;
    }
  }
  for (const dimension of Object.keys(grouped) as DimensionName[]) {
    grouped[dimension] = [...(grouped[dimension] ?? [])].sort((a, b) => combinedPassageScore(b) - combinedPassageScore(a));
  }
  return grouped;
}

function combinedPassageScore(passage: Passage): number {
  return passage.relevanceScore * 0.55 + passage.evidenceDensityScore * 0.45;
}

function extractFactLine(text: string): string {
  const lines = text.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean);
  const scored = lines.map((line) => ({
    line,
    score:
      (/\b\d[\d,]*(?:\.\d+)?\s*(?:crore|lakh|million|billion|percent|%|cases|incidents)\b/i.test(line) ? 3 : 0)
      + (/\b(Supreme Court|High Court|Article\s+\d+|Section\s+\d+|POCSO|IPC|CrPC)\b/i.test(line) ? 2 : 0)
      + (/\b(CAG|NCRB|PIB|MEA|RBI|NITI|NHRC|ECI|CBI|ED|NIA)\b/i.test(line) ? 1 : 0),
  }));
  const best = scored.sort((a, b) => b.score - a.score)[0]?.line ?? text;
  return best.slice(0, 260);
}

function isDimensionName(value: string): value is DimensionName {
  return [
    "political",
    "constitutional",
    "economic",
    "security",
    "human_rights",
    "judiciary",
    "diplomatic",
    "technological",
    "electoral",
    "media_information",
    "governance",
    "federalism",
    "social_stability",
    "public_sentiment",
    "international_relations",
    "strategic_affairs",
  ].includes(value);
}

export function summarizeEvidenceRegistry(registry: EvidenceRegistry) {
  return {
    totalSources: registry.sources.length,
    tierCounts: registry.sources.reduce((acc, source) => {
      acc[source.tier] = (acc[source.tier] ?? 0) + 1;
      return acc;
    }, { tier1: 0, tier2: 0, tier3: 0, tier4: 0, tier5: 0, untiered: 0 } as Record<NumberedSource["tier"], number>),
    courtJudgementCount: registry.courtJudgements.length,
    snippetOnlyCount: registry.snippetOnlySources.length,
    passageCount: registry.passages.length,
    semanticDuplicateCount: registry.semanticDuplicateCount,
    evidenceDensityScore: registry.evidenceDensityScore,
    evidenceGaps: registry.evidenceGaps,
  };
}

export function auditSourceContentGaps(
  registry: EvidenceRegistry,
): {
  sourcesWithFullContent: number;
  sourcesSnippetOnly: number;
  sourcesEmpty: number;
  gaps: Array<{ index: number; url: string; reason: string }>;
} {
  const gaps: Array<{ index: number; url: string; reason: string }> = [];

  for (const source of registry.sources) {
    if (!source.content && !source.snippet) {
      gaps.push({ index: source.index, url: source.url, reason: "no content or snippet" });
    } else if (!source.hasFullContent && source.tier === "tier1") {
      gaps.push({ index: source.index, url: source.url, reason: "tier1 source with snippet only" });
    }
  }

  return {
    sourcesWithFullContent: registry.sources.filter((source) => source.hasFullContent).length,
    sourcesSnippetOnly: registry.sources.filter((source) => !source.hasFullContent && (source.snippet?.length ?? 0) > 0).length,
    sourcesEmpty: registry.sources.filter((source) => !source.content && !source.snippet).length,
    gaps,
  };
}

const CONTENT_LIMITS: Record<string, number> = {
  "indiankanoon.org": 20000,
  "cag.gov.in": 16000,
  "ncrb.gov.in": 14000,
  "prsindia.org": 12000,
  "mea.gov.in": 8000,
  "pib.gov.in": 6000,
};

function getContentLimit(url: string): number {
  const lowerUrl = url.toLowerCase();
  for (const [domain, limit] of Object.entries(CONTENT_LIMITS)) {
    if (lowerUrl.includes(domain)) return limit;
  }
  return 8000;
}

export function validateEvidenceRegistryCompleteness(
  registry: EvidenceRegistry,
  engine: DimensionEngineOutput,
): { complete: boolean; missingDimensions: string[]; coverageScore: number } {
  const missingDimensions: string[] = [];
  const allActiveDimensions = [
    ...engine.primaryDimensions.map((dimension) => dimension.name),
    ...engine.secondaryDimensions.map((dimension) => dimension.name),
  ];

  for (const dim of allActiveDimensions) {
    const hasEvidence = [...registry.tier1Sources, ...registry.tier2Sources].some((source) =>
      source.dimensions?.includes(dim)
    );
    if (!hasEvidence) missingDimensions.push(dim);
  }

  const coverageScore = allActiveDimensions.length > 0
    ? ((allActiveDimensions.length - missingDimensions.length) / allActiveDimensions.length) * 100
    : 0;

  return { complete: missingDimensions.length === 0, missingDimensions, coverageScore };
}

function detectEvidenceGaps(results: EnrichedResult[], agendaText: string): string[] {
  const gaps: string[] = [];
  const hasCag = results.some((r) => r.url.includes("cag.gov.in"));
  const hasNcrb = results.some((r) => r.url.includes("ncrb.gov.in"));
  const hasCourtJudgement = results.some((r) => r.judgement?.isJudgement || r.sourceType === "court_judgement");
  const hasParliamentaryRecord = results.some((r) => r.url.includes("prsindia.org") || r.url.includes("sansad.in"));

  if (!hasCag && /\b(audit|scheme|budget|spending|performance|implementation)\b/i.test(agendaText)) {
    gaps.push("No CAG audit report retrieved - government scheme performance data unavailable");
  }
  if (!hasNcrb && /\b(crime|violence|security|incident|case|arrest)\b/i.test(agendaText)) {
    gaps.push("No NCRB data retrieved - crime statistics unavailable for this topic");
  }
  if (!hasCourtJudgement && /\b(constitutional|rights|court|legal|article|section|law)\b/i.test(agendaText)) {
    gaps.push("No court judgement retrieved - constitutional/legal dimension unsupported by case law");
  }
  if (!hasParliamentaryRecord && /\b(parliament|committee|bill|legislation|rajya|lok|sansad)\b/i.test(agendaText)) {
    gaps.push("No parliamentary committee report retrieved - legislative history unverified");
  }

  return gaps;
}

function inferEvidenceDimensions(result: EnrichedResult, agendaText: string): string[] {
  const text = `${agendaText} ${result.title} ${result.snippet} ${result.content ?? ""} ${result.url}`.toLowerCase();
  const matches: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["constitutional", /\b(constitution|constitutional|article|fundamental right|basic structure)\b/],
    ["judiciary", /\b(supreme court|high court|judgment|judgement|bench|petition|pil)\b/],
    ["human_rights", /\b(human rights|detention|uapa|civil libert|freedom|activist|journalist)\b/],
    ["federalism", /\b(federal|state government|governor|president'?s rule|article 356|centre-state)\b/],
    ["political", /\b(party|election|opposition|coalition|parliament|lok sabha|rajya sabha)\b/],
    ["governance", /\b(governance|scheme|implementation|accountability|audit|cag|ministry)\b/],
    ["economic", /\b(economic|budget|fund|spending|fiscal|mgnrega|employment|wage)\b/],
    ["security", /\b(security|terror|insurgency|border|internal security|police)\b/],
    ["diplomatic", /\b(diplomatic|foreign|mea|treaty|bilateral|united nations|un)\b/],
    ["international_relations", /\b(international|global|united nations|world bank|amnesty|hrw|freedom house)\b/],
    ["media_information", /\b(media|press|journalist|news|broadcast|digital information)\b/],
    ["sociocultural", /\b(caste|religion|gender|minority|community|social)\b/],
    ["technological", /\b(technology|digital|internet|data protection|surveillance|ai)\b/],
    ["strategic_affairs", /\b(strategy|strategic|defence|geopolitical|leverage)\b/],
  ];

  for (const [dimension, pattern] of checks) {
    if (pattern.test(text)) matches.push(dimension);
  }
  return [...new Set(matches)];
}
