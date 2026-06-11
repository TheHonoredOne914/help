import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { SourceBucketId } from "../retrieval/source-buckets.js";
import { computeCitationStrength } from "./citation-strength-filter.js";
import { validateBeforeStorage } from "./registry-integrity.js";
import { mergeDuplicateSource } from "./source-deduper.js";
import { canonicalizeUrl, normalizeEvidenceSourceInput } from "./source-normalizer.js";
import type { CitationStrength, CompleteEvidenceSourceInput, EnrichmentCard, EvidenceSource, EvidenceSourceInput, RawEvidenceSourceInput, SourceClass, TopChunk } from "./evidence-registry-types.js";

export type { CitationStrength, CompleteEvidenceSourceInput, EnrichmentCard, EvidenceSource, EvidenceSourceInput, ExtractionQuality, RawEvidenceSourceInput, SourceClass, TopChunk } from "./evidence-registry-types.js";
export { canonicalizeUrl };

export class EvidenceRegistryCore {
  readonly sources: EvidenceSource[] = [];
  private nextSourceId = 1;
  constructor(readonly contract: AgendaContract) {}

  addSource(source: EvidenceSourceInput): EvidenceSource {
    const prepared = prepareForStorage(source);
    const existingIdx = this.sources.findIndex((item) => item.canonicalUrl === prepared.canonicalUrl);
    if (existingIdx !== -1) {
      const merged = finalizeStoredSource(mergeDuplicateSource(this.sources[existingIdx], prepared));
      this.sources[existingIdx] = merged;
      return merged;
    }
    const next = finalizeStoredSource({ ...prepared, id: this.allocateSourceId() });
    this.sources.push(next);
    return next;
  }

  getSource(id: number): EvidenceSource | undefined {
    return this.sources.find((source) => source.id === id);
  }

  getSourcesByBucket(bucketId: SourceBucketId): EvidenceSource[] {
    return this.sources.filter((source) => source.bucketIds.includes(bucketId));
  }

  getSourcesByClass(sourceClass: SourceClass): EvidenceSource[] {
    return this.sources.filter((source) => source.sourceClass === sourceClass);
  }

  getStrongSources(): EvidenceSource[] {
    return this.sources.filter((source) => source.citationStrength === "strong");
  }

  getMediumSources(): EvidenceSource[] {
    return this.sources.filter((source) => source.citationStrength === "medium");
  }

  getWeakSources(): EvidenceSource[] {
    return this.sources.filter((source) => source.citationStrength === "weak");
  }

  getIneligibleSources(): EvidenceSource[] {
    return this.sources.filter((source) => source.citationStrength === "ineligible");
  }

  getTopChunksForSource(id: number): TopChunk[] {
    return this.getSource(id)?.topChunks ?? [];
  }

  getEnrichmentCard(id: number): EnrichmentCard | undefined {
    return this.getSource(id)?.enrichmentCard;
  }

  getCitationLabel(id: number): string {
    return `Source ${id}`;
  }

  getCitationMarkdown(id: number): string {
    const source = this.getSource(id);
    return source ? `[Source ${id}](${markdownCitationUrl(source.url)})` : "";
  }

  findSourcesForClaim(claimText: string): EvidenceSource[] {
    return this.sources.filter((source) => sourceSupportsClaim(source, claimText));
  }

  validateCitationForClaim(sourceId: number, claimText: string): boolean {
    const source = this.getSource(sourceId);
    if (!source?.citationEligible) return false;
    return sourceSupportsClaim(source, claimText);
  }

  getBucketCoverage(): Record<string, number> {
    return this.sources.reduce((acc, source) => {
      for (const bucketId of source.bucketIds) acc[bucketId] = (acc[bucketId] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  getCitationEligibleCount(): number {
    return this.sources.filter((source) => source.citationEligible).length;
  }

  getCitationEligibleSources(): EvidenceSource[] {
    return this.sources.filter((source) => source.citationEligible);
  }

  exportForPrompt(maxChars = 12_000): string {
    const lines: string[] = [];
    let total = 0;
    for (const source of this.getCitationEligibleSources()) {
      const remaining = maxChars - total;
      if (remaining < 40) break;
      const entry = buildPromptEntry(source, Math.max(160, remaining));
      if (total + entry.length > maxChars) {
        const compact = buildPromptEntry(source, Math.max(0, remaining), true);
        if (compact && total + compact.length <= maxChars) {
          lines.push(compact);
          total += compact.length + 2;
        }
        continue;
      }
      lines.push(entry);
      total += entry.length + 2;
    }
    return lines.join("\n\n");
  }

  exportForDebugRedacted(): unknown {
    return {
      requestId: this.contract.requestId,
      totalSources: this.sources.length,
      citationEligible: this.getCitationEligibleCount(),
      bucketCoverage: this.getBucketCoverage(),
    };
  }

  private allocateSourceId(): number {
    while (this.sources.some((source) => source.id === this.nextSourceId)) {
      this.nextSourceId += 1;
    }
    const id = this.nextSourceId;
    this.nextSourceId += 1;
    return id;
  }
}

function buildPromptEntry(source: EvidenceSource, maxChars: number, compact = false): string {
  const baseLines = [
    `[Source ${source.id}] ${clip(source.title, compact ? 72 : 140)}`,
    `URL: ${source.url}`,
    `Strength: ${source.citationStrength}`,
    `Facts: ${clip(source.keyFacts.slice(0, compact ? 1 : 3).join("; ") || source.topChunks[0]?.text || "none", compact ? 80 : 420)}`,
    `Limitations: ${clip(source.limitations.slice(0, compact ? 1 : 2).join("; ") || "none", compact ? 60 : 220)}`,
  ];
  const entry = baseLines.join("\n");
  if (entry.length <= maxChars) return entry;
  if (!compact) return buildPromptEntry(source, maxChars, true);
  return "";
}

function clip(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}.`;
}

export function buildEvidenceRegistryFromSources(rawSources: RawEvidenceSourceInput[], contract: AgendaContract): EvidenceRegistryCore {
  const registry = new EvidenceRegistryCore(contract);
  for (const raw of rawSources) {
    const normalized = normalizeEvidenceSourceInput(raw);
    if (!normalized) continue;
    registry.addSource(normalized);
  }
  return registry;
}

function prepareForStorage(source: EvidenceSourceInput): CompleteEvidenceSourceInput {
  const withDefaults: CompleteEvidenceSourceInput = {
    ...source,
    canonicalUrl: canonicalizeUrl(source.canonicalUrl ?? source.url),
    fullText: source.fullText ?? null,
    snippet: source.snippet ?? null,
    topChunks: source.topChunks ?? [],
    limitedSource: source.limitedSource ?? (!source.fullText || source.extractionQuality === "snippet" || source.extractionQuality === "failed"),
    citationStrength: source.citationStrength ?? "ineligible",
    citationEligible: source.citationEligible ?? true,
  };
  const integrity = validateBeforeStorage(withDefaults);
  const citationEligible = withDefaults.citationEligible && integrity.ok && withDefaults.extractionQuality !== "failed";
  return {
    ...withDefaults,
    citationEligible,
    limitedSource: withDefaults.limitedSource || !integrity.ok,
    citationStrength: computeCitationStrength({ ...withDefaults, citationEligible }),
  };
}

function finalizeStoredSource(source: EvidenceSource): EvidenceSource {
  const citationStrength: CitationStrength = computeCitationStrength(source);
  return {
    ...source,
    citationEligible: citationStrength !== "ineligible" && source.citationEligible,
    citationStrength,
    topChunks: source.topChunks.map((chunk) => ({ ...chunk, sourceId: source.id })),
  };
}

function sourceSupportsClaim(source: EvidenceSource, claimText: string): boolean {
  const claimTokens = importantTokens(claimText);
  if (claimTokens.size < 2) return false;
  return evidenceTexts(source).some((text) => hasPhraseOverlap(claimText, text) || hasTokenOverlap(claimTokens, importantTokens(text)));
}

function evidenceTexts(source: EvidenceSource): string[] {
  return [
    ...source.topChunks.map((chunk) => chunk.text),
    ...source.keyFacts,
    ...source.legalHoldings,
    ...source.keyNumbers,
    source.fullText,
    source.snippet,
    source.title,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function hasPhraseOverlap(claimText: string, evidenceText: string): boolean {
  const claimWords = [...importantTokens(claimText)];
  if (claimWords.length < 3) return false;
  const evidence = normalizeText(evidenceText);
  for (let index = 0; index <= claimWords.length - 3; index += 1) {
    const phrase = claimWords.slice(index, index + 3).join(" ");
    if (evidence.includes(phrase)) return true;
  }
  return false;
}

function hasTokenOverlap(left: Set<string>, right: Set<string>): boolean {
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  const required = Math.max(2, Math.ceil(Math.min(left.size, right.size) * 0.35));
  return overlap >= required;
}

function importantTokens(text: string): Set<string> {
  return new Set(normalizeText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set([
  "about",
  "against",
  "also",
  "and",
  "from",
  "into",
  "relevant",
  "source",
  "that",
  "the",
  "this",
  "with",
]);

export function markdownCitationUrl(url: string): string {
  return url.replace(/\(/g, "%28").replace(/\)/g, "%29");
}
