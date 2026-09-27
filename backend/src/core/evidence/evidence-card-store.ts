import type { EvidenceRegistryCore, EvidenceSource } from "./evidence-registry.js";
import type { EvidenceCard } from "./evidence-pack/types.js";

export type { EvidenceCard } from "./evidence-pack/types.js";

export function buildEvidenceCard(source: EvidenceSource, registry: EvidenceRegistryCore): EvidenceCard {
  return {
    sourceId: source.id,
    citation: registry.getCitationMarkdown(source.id),
    title: source.title,
    url: source.url,
    sourceClass: source.sourceClass,
    bucketIds: source.bucketIds,
    date: source.date,
    relevanceScore: source.authorityScore,
    keyFacts: source.keyFacts.length ? source.keyFacts : [firstRelevantSentence(source.fullText ?? source.snippet ?? "") ?? `Title-only relevance: ${source.title}`],
    keyNumbers: source.keyNumbers.length ? source.keyNumbers : extractNumbers(`${source.snippet ?? ""} ${source.fullText ?? ""}`),
    legalHoldings: source.legalHoldings.length ? source.legalHoldings : inferLegalHoldings(source),
    governmentPosition: source.sourceClass === "official_government" || source.sourceClass === "electoral_body" ? source.keyFacts[0] ?? null : null,
    civilLibertiesPosition: /watchdog|press|civic/.test(source.sourceClass) ? source.keyFacts[0] ?? null : null,
    electoralIntegrityPosition: source.bucketIds.includes("electoral_integrity") ? source.keyFacts[0] ?? null : null,
    debateUse: source.keyFacts[0] ?? firstRelevantSentence(source.snippet ?? source.fullText ?? "") ?? `Use only as background context for ${source.title}.`,
    limitations: source.limitations.length ? source.limitations : inferLimitations(source),
    usableSections: source.bucketIds,
    contentPreview: compressedCardExcerpt(source),
    citationStrength: source.citationStrength,
    topChunks: source.topChunks,
    limitedSource: source.limitedSource,
    extractionQuality: source.extractionQuality,
    enrichmentCard: source.enrichmentCard,
    evidenceItems: Array.isArray(source.enrichmentCard?.evidenceItems) ? source.enrichmentCard.evidenceItems : [],
    namedEntities: source.namedEntities ?? [],
  };
}

function firstRelevantSentence(text: string): string | undefined {
  const sentence = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).find((part) => part.length >= 24);
  return sentence?.slice(0, 280);
}

/** RECOMP-style: 1–2 top sentences from topChunks for prompt body; original chunks retained on card. */
function compressedCardExcerpt(source: EvidenceSource): string {
  const fromChunks = source.topChunks
    .slice(0, 2)
    .flatMap((chunk) => chunk.text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length >= 24).slice(0, 1))
    .slice(0, 2);
  if (fromChunks.length) return fromChunks.join(" ").slice(0, 480);
  return (source.topChunks[0]?.text ?? source.fullText ?? source.snippet ?? "").slice(0, 600);
}

function extractNumbers(text: string): string[] {
  return [...new Set(text.match(/\b20\d{2}\b|\b\d+(?:\.\d+)?%|\b\d+(?:,\d{3})+\b/g) ?? [])].slice(0, 5);
}

function inferLegalHoldings(source: EvidenceSource): string[] {
  if (!["court_primary", "legal_commentary"].includes(source.sourceClass)) return [];
  return [firstRelevantSentence(source.snippet ?? source.fullText ?? "")].filter(Boolean) as string[];
}

function inferLimitations(source: EvidenceSource): string[] {
  const limitations: string[] = [];
  if (source.limitedSource) limitations.push("Limited extraction; verify before relying on fine-grained claims.");
  if (source.extractionQuality === "failed") limitations.push("Extraction failed; source can only support a gap note unless manually verified.");
  if (source.authorityScore < 65) limitations.push("Lower-authority or weakly relevant source.");
  if (!source.keyFacts.length && !source.snippet && !source.fullText) limitations.push("No extractable source text was available.");
  return limitations;
}
