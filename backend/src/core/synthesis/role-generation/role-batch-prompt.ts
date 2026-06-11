import type { EvidenceCard } from "../../evidence/evidence-pack-builder.js";

export interface RoleBatchPromptOptions {
  roleName?: string;
  maxChunks?: number;
  maxCharsPerChunk?: number;
}

export function buildRoleBatchPrompt(cards: EvidenceCard[], options: RoleBatchPromptOptions = {}): string {
  const maxChunks = options.maxChunks ?? 3;
  const maxCharsPerChunk = options.maxCharsPerChunk ?? 420;
  return [
    `Assigned sources for ${options.roleName ?? "role"}:`,
    cards.map((card) => serializeCard(card, maxChunks, maxCharsPerChunk)).join("\n\n"),
  ].join("\n\n");
}

export function buildSourceUsageBatchPrompt(cards: EvidenceCard[]): string {
  return buildRoleBatchPrompt(cards, { roleName: "source_usage" });
}

function serializeCard(card: EvidenceCard, maxChunks: number, maxCharsPerChunk: number): string {
  return [
    `SourceId: ${card.sourceId}`,
    `Title: ${card.title}`,
    `URL: ${card.url}`,
    `Citation: ${card.citation}`,
    `sourceClass: ${card.sourceClass}`,
    `bucketIds: ${(card.bucketIds ?? []).join(", ") || "none"}`,
    `citationStrength: ${card.citationStrength ?? "medium"}`,
    `limitedSource: ${card.limitedSource === true}`,
    `extractionQuality: ${card.extractionQuality ?? "partial"}`,
    `namedEntities: ${(card.namedEntities ?? []).slice(0, 12).join("; ") || "none"}`,
    `keyFacts: ${((card.keyFacts ?? []).length ? card.keyFacts : [card.debateUse]).filter(Boolean).join("; ") || "none"}`,
    `keyNumbers: ${(card.keyNumbers ?? []).join("; ") || "none"}`,
    `legalHoldings: ${(card.legalHoldings ?? []).join("; ") || "none"}`,
    `limitations: ${(card.limitations ?? []).join("; ") || "none"}`,
    "TopChunks:",
    ...(card.topChunks ?? []).slice(0, maxChunks).map((chunk, index) => `[${index + 1}] ${clip(chunk.text, maxCharsPerChunk)} (score: ${chunk.score})`),
    `contentPreview: ${card.contentPreview || (card.keyFacts ?? []).join(" ") || card.debateUse || "none"}`,
    `debateUse: ${card.debateUse || "none"}`,
  ].join("\n");
}

function clip(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}.`;
}
