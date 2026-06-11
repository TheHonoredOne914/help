import type { EvidenceRegistryCore, EvidenceSource } from "./evidence-registry.js";
import { findBestChunk } from "./evidence-trace.js";
import type { ModelRoleOutput, SourceUsageMapItem, SourceUsageType } from "./source-usage-map.js";

export interface EvidenceSpan {
  sourceId: number;
  url: string;
  title: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
  extractionQuality: "full" | "partial" | "snippet" | "title_only" | "failed";
}

export interface ClaimLedgerItem {
  claimId: string;
  sourceId: number;
  url: string;
  title: string;
  usageType: SourceUsageType;
  extractedClaim?: string;
  legalHolding?: string;
  extractedNumber?: string;
  roleName: string;
  supportedSection?: string;
  supportType: "direct_quote" | "paraphrase" | "number" | "legal_holding" | "context_only";
  confidence: "high" | "medium" | "low";
  evidenceSpan?: EvidenceSpan;
  limitations?: string[];
  citationCreditEligible: boolean;
}

export interface DiscardedClaimLedgerItem {
  sourceId: number;
  roleName: string;
  claimText: string;
  reason: "missing_source" | "empty_claim" | "duplicate_claim" | "repeated_generic_claim" | "no_evidence_span";
}

export interface ClaimLedger {
  items: ClaimLedgerItem[];
  discardedClaims: DiscardedClaimLedgerItem[];
  summary: {
    itemCount: number;
    sourceCount: number;
    citationCreditEligibleCount: number;
    lowConfidenceCount: number;
    roles: string[];
  };
}

const GENERIC_CLAIM_PATTERNS = [
  /^this source is relevant\b/i,
  /^the source is relevant\b/i,
  /^source \d+ is relevant\b/i,
  /^this article discusses\b/i,
  /^this report discusses\b/i,
  /^the document provides context\b/i,
  /^relevant to the agenda\b/i,
];

export function buildClaimLedger(outputs: ModelRoleOutput[], registry: EvidenceRegistryCore, approvedSourceIds?: number[]): ClaimLedger {
  const raw = outputs.flatMap((output) => output.sourceUsageMap.map((item) => ({ output, item })))
    .filter(x => !approvedSourceIds || approvedSourceIds.includes(x.item.sourceId));
  const normalizedClaimCounts = new Map<string, number>();
  for (const { item } of raw) {
    const claimText = extractClaimText(item);
    if (!claimText) continue;
    const normalized = normalizeClaim(claimText);
    normalizedClaimCounts.set(normalized, (normalizedClaimCounts.get(normalized) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const items: ClaimLedgerItem[] = [];
  const discardedClaims: DiscardedClaimLedgerItem[] = [];

  for (const { output, item } of raw) {
    const source = registry.getSource(item.sourceId);
    const claimText = extractClaimText(item);
    if (!source) {
      discardedClaims.push({ sourceId: item.sourceId, roleName: output.roleName, claimText: claimText ?? "", reason: "missing_source" });
      continue;
    }
    if (!claimText) {
      discardedClaims.push({ sourceId: item.sourceId, roleName: output.roleName, claimText: "", reason: "empty_claim" });
      continue;
    }
    const normalized = normalizeClaim(claimText);
    const dedupeKey = `${item.sourceId}:${normalized}`;
    if (seen.has(dedupeKey)) {
      discardedClaims.push({ sourceId: item.sourceId, roleName: output.roleName, claimText, reason: "duplicate_claim" });
      continue;
    }
    if (isRepeatedGenericClaim(claimText, normalizedClaimCounts.get(normalized) ?? 0, raw.length)) {
      discardedClaims.push({ sourceId: item.sourceId, roleName: output.roleName, claimText, reason: "repeated_generic_claim" });
      continue;
    }
    const evidenceSpan = findEvidenceSpan(source, claimText);
    if (!evidenceSpan) {
      discardedClaims.push({ sourceId: item.sourceId, roleName: output.roleName, claimText, reason: "no_evidence_span" });
      continue;
    }
    seen.add(dedupeKey);
    const confidence = confidenceFor(item, source, evidenceSpan);
    items.push({
      claimId: `${output.roleName}:${item.sourceId}:${hashClaim(normalized)}`,
      sourceId: item.sourceId,
      url: source.url,
      title: source.title,
      usageType: item.usageType,
      extractedClaim: item.extractedClaim,
      legalHolding: item.legalHolding,
      extractedNumber: item.extractedNumber,
      roleName: output.roleName,
      supportedSection: item.supportedSection,
      supportType: supportTypeFor(item),
      confidence,
      evidenceSpan,
      limitations: [item.limitation, ...(source.limitations ?? [])].filter((value): value is string => Boolean(value?.trim())),
      citationCreditEligible: isCitationCreditEligible(item, source, evidenceSpan, confidence),
    });
  }

  const sourceIds = new Set(items.map((item) => item.sourceId));
  const roles = new Set(items.map((item) => item.roleName));
  return {
    items,
    discardedClaims,
    summary: {
      itemCount: items.length,
      sourceCount: sourceIds.size,
      citationCreditEligibleCount: items.filter((item) => item.citationCreditEligible).length,
      lowConfidenceCount: items.filter((item) => item.confidence === "low").length,
      roles: [...roles],
    },
  };
}

export function formatClaimLedgerForPrompt(ledger: ClaimLedger, limit = 60): string {
  const sorted = [...ledger.items].sort((a, b) => {
    if (a.citationCreditEligible !== b.citationCreditEligible) return a.citationCreditEligible ? -1 : 1;
    const confRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return confRank[b.confidence] - confRank[a.confidence];
  });
  const lines = sorted.slice(0, limit).map((item) => [
    `[Claim ${item.claimId}] Source ${item.sourceId}: ${item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? item.evidenceSpan?.text}`,
    `URL: ${item.url}`,
    `Role: ${item.roleName}; Section: ${item.supportedSection ?? "unspecified"}; Type: ${item.supportType}; Confidence: ${item.confidence}; CitationCredit: ${item.citationCreditEligible}`,
    `EvidenceSpan: ${item.evidenceSpan?.text ?? "none"}`,
    item.limitations?.length ? `Limitations: ${item.limitations.slice(0, 2).join("; ")}` : null,
  ].filter(Boolean).join("\n"));
  const discarded = ledger.discardedClaims.length
    ? `Discarded claims: ${ledger.discardedClaims.slice(0, 20).map((item) => `${item.reason} source=${item.sourceId}`).join("; ")}`
    : "Discarded claims: none";
  return [
    `Summary: ${ledger.summary.itemCount} claim items, ${ledger.summary.sourceCount} sources, ${ledger.summary.citationCreditEligibleCount} citation-credit eligible.`,
    ...lines,
    discarded,
  ].join("\n\n");
}

function extractClaimText(item: SourceUsageMapItem): string | null {
  return [
    item.extractedClaim,
    item.legalHolding,
    item.extractedNumber,
    item.supportedSection,
    item.limitation,
  ].find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

function findEvidenceSpan(source: EvidenceSource, claimText: string): EvidenceSpan | undefined {
  const quality = source.extractionQuality === "snippet"
    ? "snippet"
    : source.extractionQuality === "failed"
      ? "failed"
      : source.keyFacts.every((fact) => /^title-only relevance:/i.test(fact.trim()))
        ? "title_only"
        : source.extractionQuality;
  const haystacks = [
    ...source.keyFacts,
    ...source.legalHoldings,
    ...source.keyNumbers,
    source.fullText,
    source.snippet,
    ...source.limitations,
  ].filter((value): value is string => Boolean(value?.trim()));
  const claimNeedles = importantTokens(claimText);
  for (const text of haystacks) {
    const span = bestSentence(text, claimNeedles);
    if (span) {
      return {
        sourceId: source.id,
        url: source.url,
        title: source.title,
        text: span.text,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        extractionQuality: quality,
      };
    }
  }
  const matchingChunk = findBestChunk(claimText, source.topChunks ?? []);
  if (matchingChunk) {
    return {
      sourceId: source.id,
      url: source.url,
      title: source.title,
      text: matchingChunk.text,
      extractionQuality: quality,
    };
  }
  return undefined;
}

function bestSentence(text: string, claimTokens: Set<string>): { text: string; startOffset: number; endOffset: number } | undefined {
  const sentences = splitSentences(text);
  let best: { text: string; startOffset: number; endOffset: number; score: number } | undefined;
  for (const sentence of sentences) {
    const tokens = importantTokens(sentence.text);
    let score = 0;
    for (const token of claimTokens) {
      if (tokens.has(token)) score += 1;
    }
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && sentence.text.length < best.text.length)) {
      best = { ...sentence, score };
    }
  }
  return best ? { text: best.text, startOffset: best.startOffset, endOffset: best.endOffset } : undefined;
}

function splitSentences(text: string): Array<{ text: string; startOffset: number; endOffset: number }> {
  const matches = [...text.matchAll(/[^.!?\n]+[.!?]?/g)];
  return matches
    .map((match) => ({
      text: cleanWhitespace(match[0]),
      startOffset: match.index ?? 0,
      endOffset: (match.index ?? 0) + match[0].length,
    }))
    .filter((item) => item.text.length >= 8);
}

function supportTypeFor(item: SourceUsageMapItem): ClaimLedgerItem["supportType"] {
  if (item.usageType === "legal_holding_extracted") return "legal_holding";
  if (item.usageType === "number_extracted") return "number";
  if (item.usageType === "limitation_identified" || item.usageType === "relevant_but_weak") return "context_only";
  if (item.extractedClaim && item.supportedSection) return "paraphrase";
  return "direct_quote";
}

function confidenceFor(item: SourceUsageMapItem, source: EvidenceSource, span: EvidenceSpan): ClaimLedgerItem["confidence"] {
  if (span.extractionQuality === "snippet" || span.extractionQuality === "title_only" || span.extractionQuality === "failed") return "low";
  if ((source.citationStrength === "strong" || source.citationStrength === "medium") && (source.extractionQuality === "full" || source.extractionQuality === "partial")) {
    return item.confidence === "high" && source.confidence === "high" ? "high" : "medium";
  }
  if (item.confidence === "low" || source.confidence === "low") return "low";
  if (item.confidence === "medium" || source.confidence === "medium") return "medium";
  return "high";
}

function isCitationCreditEligible(item: SourceUsageMapItem, source: EvidenceSource, span: EvidenceSpan, confidence: ClaimLedgerItem["confidence"]): boolean {
  if (!source.citationEligible) return false;
  if (item.usageType === "relevant_but_weak") return false;
  if (span.extractionQuality === "snippet" || span.extractionQuality === "title_only" || span.extractionQuality === "failed") return false;
  if ((source.citationStrength === "strong" || source.citationStrength === "medium") && (source.extractionQuality === "full" || source.extractionQuality === "partial")) return true;
  if (confidence === "low") return false;
  return true;
}

function isRepeatedGenericClaim(claimText: string, count: number, total: number): boolean {
  if (!GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(claimText.trim()))) return false;
  return count >= 3 || (total >= 8 && count >= Math.ceil(total * 0.25));
}

function normalizeClaim(claim: string): string {
  return cleanWhitespace(claim).toLowerCase().replace(/\bsource\s+\d+\b/g, "source");
}

function importantTokens(text: string): Set<string> {
  return new Set(cleanWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["source", "this", "that", "with", "from", "into", "relevant"].includes(token)));
}

function hashClaim(claim: string): string {
  let hash = 0;
  for (let index = 0; index < claim.length; index += 1) {
    hash = ((hash << 5) - hash + claim.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
