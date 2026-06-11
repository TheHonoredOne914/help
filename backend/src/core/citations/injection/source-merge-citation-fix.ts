import type { EvidenceSource, EvidenceSourceInput, ExtractionQuality, TopChunk } from "../../evidence/evidence-registry-types.js";
import { computeCitationStrength } from "../../evidence/citation-strength-filter.js";

export function mergeDuplicateSourceFix(existing: EvidenceSource, incoming: EvidenceSourceInput): EvidenceSource {
  const fullText = preferLongerText(existing.fullText, incoming.fullText);
  const extractionQuality = preferBetterQuality(existing.extractionQuality, incoming.extractionQuality);
  const citationEligible = Boolean(existing.citationEligible || incoming.citationEligible) && extractionQuality !== "failed";
  
  const mergedSource = {
    ...existing,
    title: preferText(existing.title, incoming.title),
    url: preferText(existing.url, incoming.url),
    // Fix BUG-19-18: canonical URL wins over redirect URL
    canonicalUrl: incoming.canonicalUrl || existing.canonicalUrl,
    domain: preferText(existing.domain, incoming.domain),
    bucketIds: [...new Set([...existing.bucketIds, ...incoming.bucketIds])],
    sourceClass: incoming.sourceClass === "low_quality" ? existing.sourceClass : incoming.sourceClass ?? existing.sourceClass,
    authorityScore: Math.max(existing.authorityScore, incoming.authorityScore),
    date: incoming.date ?? existing.date,
    fullText,
    snippet: preferLongerText(existing.snippet, incoming.snippet),
    extractionQuality,
    discoveredBy: [...new Set([...(existing.discoveredBy ?? []), ...(incoming.discoveredBy ?? [])])],
    extractedBy: incoming.extractedBy ?? existing.extractedBy,
    fallbackExtractionUsed: Boolean(existing.fallbackExtractionUsed || incoming.fallbackExtractionUsed),
    keyFacts: dedupeStrings([...existing.keyFacts, ...incoming.keyFacts]),
    keyNumbers: dedupeStrings([...existing.keyNumbers, ...incoming.keyNumbers]),
    legalHoldings: dedupeStrings([...existing.legalHoldings, ...incoming.legalHoldings]),
    namedEntities: dedupeStrings([...existing.namedEntities, ...incoming.namedEntities]),
    limitations: dedupeStrings([...existing.limitations, ...incoming.limitations]),
    confidence: preferConfidence(existing.confidence, incoming.confidence),
    citationEligible,
    enrichmentCard: incoming.enrichmentCard ?? existing.enrichmentCard,
    topChunks: mergeTopChunks(existing.topChunks, incoming.topChunks ?? []),
    limitedSource: computeLimitedSource(extractionQuality, fullText, existing.limitedSource, incoming.limitedSource),
  } as EvidenceSource;

  // Fix BUG-19-04: Recompute citationStrength after source merge
  mergedSource.citationStrength = computeCitationStrength(mergedSource);

  return mergedSource;
}

export function preferBetterQuality(a: ExtractionQuality, b: ExtractionQuality): ExtractionQuality {
  const rank: Record<ExtractionQuality, number> = { full: 4, partial: 3, snippet: 2, failed: 1 };
  return rank[a] >= rank[b] ? a : b;
}

export function mergeTopChunks(existing: TopChunk[], incoming: TopChunk[]): TopChunk[] {
  const seen = new Set<string>();
  const merged: TopChunk[] = [];
  for (const chunk of [...existing, ...incoming].sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)) {
    const text = chunk.text.trim();
    if (!text) continue;
    const key = `${chunk.chunkIndex}:${text.slice(0, 120).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...chunk, text });
  }
  return merged.slice(0, 12);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function preferLongerText(existing: string | null, incoming: string | null): string | null {
  if (!existing?.trim()) return incoming?.trim() ? incoming : null;
  if (!incoming?.trim()) return existing;
  return incoming.length > existing.length ? incoming : existing;
}

function preferText(existing: string, incoming: string): string {
  return incoming?.trim() ? incoming : existing;
}

function preferConfidence(existing: EvidenceSource["confidence"], incoming: EvidenceSourceInput["confidence"]): EvidenceSource["confidence"] {
  const rank: Record<EvidenceSource["confidence"], number> = { high: 3, medium: 2, low: 1 };
  return rank[incoming ?? "low"] > rank[existing] ? incoming! : existing;
}

function computeLimitedSource(quality: ExtractionQuality, fullText: string | null, existingLimited: boolean, incomingLimited?: boolean): boolean {
  if (quality === "snippet" || quality === "failed") return true;
  if (fullText?.trim()) return false;
  return Boolean(existingLimited || incomingLimited);
}
