import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { ResearchMode } from "../config/research-mode.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import { markdownCitationUrl } from "../evidence/evidence-registry.js";

export interface CitationValidationOptions {
  mode?: ResearchMode;
}

export interface CitationValidationReport {
  passed: boolean;
  validatedCitations: number[];
  rejectedCitations: string[];
  unsupportedClaims: string[];
  unsupportedCitationWarnings: string[];
  missingSourceBuckets: string[];
  sourceIdsActuallyUsed: number[];
  uniqueCitedSourceCount: number;
  linkedCitationCount: number;
  invalidCitations: string[];
  citedBuckets: string[];
  repeatedCitationWarnings: string[];
}

export function validateCitations(
  text: string,
  registry: EvidenceRegistryCore,
  contract: AgendaContract,
  options: CitationValidationOptions = {},
): CitationValidationReport {
  const rejectedCitations: string[] = [];
  const invalidCitations: string[] = [];
  const validatedCitations: number[] = [];
  const citationCounts = new Map<number, number>();
  const linkedMatches = [...text.matchAll(/\[Source\s+(\d+)\]\(([^)]+)\)/gi)];
  const bareMatches = [...text.matchAll(/\[(?:Source\s*)?(\d+)\](?!\()/gi)];

  for (const match of bareMatches) {
    rejectedCitations.push(match[0]);
    invalidCitations.push(`bare citation without registry URL: ${match[0]}`);
  }
  for (const match of linkedMatches) {
    const id = Number(match[1]);
    const url = match[2];
    const source = registry.getSource(id);
    // Landscape table cites are floor-strategy prompts, not claim grounding — omit from spam tally.
    if (!isInsideNonProseCitationSection(text, match.index ?? 0)) {
      citationCounts.set(id, (citationCounts.get(id) ?? 0) + 1);
    }
    if (!source) {
      rejectedCitations.push(match[0]);
      invalidCitations.push(`citation to non-existent Source ${id}: ${match[0]}`);
      continue;
    }
    if (!source.citationEligible) {
      rejectedCitations.push(match[0]);
      invalidCitations.push(`citation to ineligible Source ${id}: ${match[0]}`);
      continue;
    }
    if (!sameUrl(source.url, url)) {
      rejectedCitations.push(match[0]);
      invalidCitations.push(`URL mismatch for Source ${id}: expected ${source.url}, got ${url}`);
      continue;
    }
    // Link dumps are not cited claims. Evidence Landscape and Citation Ledger
    // stay in the brief as an index; they do not meet the unique-source floor.
    if (isInsideCiteMapSection(text, match.index ?? 0)) continue;
    validatedCitations.push(id);
  }

  const sourceIdsActuallyUsed = [...new Set(validatedCitations)].sort((a, b) => a - b);
  const coveredBuckets = new Set(sourceIdsActuallyUsed.flatMap((id) => registry.getSource(id)?.bucketIds ?? []));
  const missingSourceBuckets = contract.requiredSourceBuckets
    .map((bucket) => bucket.bucketId)
    .filter((bucketId) => !coveredBuckets.has(bucketId as any));
  const unsupportedClaims = detectUnsupportedCitationClaims(text);
  const grounding = detectUnsupportedCitationGrounding(text, registry, options.mode);
  const unsupportedCitationWarnings = grounding.warnings;
  const unsupportedCitationFatals = grounding.fatals;
  const repeatedCitationWarnings = [...citationCounts.entries()]
    .filter(([id, count]) => count >= 4 && sourceIdsActuallyUsed.includes(id))
    .map(([id, count]) => `repeated citation spam: Source ${id} cited ${count} times`);
  const hasInflatedSourceCount = repeatedCitationWarnings.length > 0 && sourceIdsActuallyUsed.length < contract.minimumUniqueCitedSources;
  const requiredUniqueCoverage = Math.min(contract.minimumUniqueCitedSources, registry.getCitationEligibleCount());
  if (sourceIdsActuallyUsed.length < requiredUniqueCoverage) {
    invalidCitations.push(`only ${sourceIdsActuallyUsed.length} unique cited sources; ${requiredUniqueCoverage} required for ${contract.outputDepth}`);
  }
  const missingBucketCoverageFatal = contract.requiredSourceBuckets.length > 0
    && contract.requiredSourceBuckets.length <= 3
    && missingSourceBuckets.length > 0;
  if (missingBucketCoverageFatal) {
    invalidCitations.push(`missing required source bucket coverage: ${missingSourceBuckets.join(", ")}`);
  }
  const passed = rejectedCitations.length === 0
    && unsupportedClaims.length === 0
    && unsupportedCitationFatals.length === 0
    && repeatedCitationWarnings.length === 0
    && !hasInflatedSourceCount
    && sourceIdsActuallyUsed.length >= requiredUniqueCoverage
    && !missingBucketCoverageFatal;
  if (unsupportedCitationWarnings.length > 0) {
    console.warn(`[citation-validator] ${unsupportedCitationWarnings.length} unsupported citation grounding warning(s) in ${options.mode ?? "unknown"} mode`);
  }
  return {
    passed,
    validatedCitations,
    rejectedCitations,
    unsupportedClaims,
    unsupportedCitationWarnings,
    missingSourceBuckets,
    sourceIdsActuallyUsed,
    uniqueCitedSourceCount: sourceIdsActuallyUsed.length,
    linkedCitationCount: linkedMatches.length,
    invalidCitations: [...invalidCitations, ...unsupportedClaims, ...unsupportedCitationFatals, ...repeatedCitationWarnings],
    citedBuckets: [...coveredBuckets].sort(),
    repeatedCitationWarnings,
  };
}

export function linkBareSourceCitations(text: string, registry: EvidenceRegistryCore): string {
  const linkOne = (rawId: string, fallback: string) => {
    const id = Number(rawId);
    const source = registry.getSource(id);
    if (!source?.citationEligible) return fallback;
    return `[Source ${id}](${markdownCitationUrl(source.url)})`;
  };
  let out = text.replace(/(?:\[|【|ã€)Source[\s\u00a0\u202f]+(\d+)(?:\]|】|ã€‘)(?!\()/gi, (match, rawId) => linkOne(rawId, match));
  // Model often writes bare "(Source 5)" — promote to linked citation.
  out = out.replace(/\(\s*Source[\s\u00a0\u202f]+(\d+)\s*\)/gi, (match, rawId) => linkOne(rawId, match));
  // Drop empty parenthetical placeholders in lists: "- (Obesity and NCD data)"
  out = out.replace(/^[ \t]*-\s*\((?!Source\b)[^)\n]{0,80}\)\s*$/gim, "");
  return out;
}

function detectUnsupportedCitationGrounding(
  text: string,
  registry: EvidenceRegistryCore,
  mode?: ResearchMode,
): { warnings: string[]; fatals: string[] } {
  const warnings: string[] = [];
  const fatals: string[] = [];
  const fatalMode = mode === "deep_research" || mode === "council";
  const seen = new Set<string>();
  for (const match of text.matchAll(/\[Source\s+(\d+)\]\(([^)]+)\)/gi)) {
    // Cite-maps (Evidence Landscape / Citation Ledger) are not claim prose — skip grounding.
    if (isInsideNonProseCitationSection(text, match.index ?? 0)) continue;
    const sourceId = Number(match[1]);
    const claimText = extractClaimTextForCitation(text, match.index ?? 0);
    if (claimText.length < 24) continue;
    const claimTokens = claimText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length >= 4);
    if (claimTokens.length < 3) continue;
    const dedupeKey = `${sourceId}:${claimText.slice(0, 80).toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (registry.validateCitationForClaim(sourceId, claimText)) continue;
    const issue = `citation Source ${sourceId} does not support claim: ${claimText.slice(0, 72)}...`;
    if (fatalMode) fatals.push(issue);
    else warnings.push(issue);
  }
  return { warnings, fatals };
}

/** Evidence Landscape and Citation Ledger are indexes. They do not count as cited claims. */
export function isInsideCiteMapSection(text: string, matchIndex: number): boolean {
  return isInsideHeadingSection(text, matchIndex, /(?:^|\n)##[^\n]*\b(?:Evidence Landscape|Citation Ledger)\b/gi);
}

/** True when matchIndex falls inside a cite-map / arsenal section (until next ##). */
export function isInsideNonProseCitationSection(text: string, matchIndex: number): boolean {
  return isInsideHeadingSection(
    text,
    matchIndex,
    /(?:^|\n)##[^\n]*\b(?:Evidence Landscape|Citation Ledger|Additional Source-Backed Bullets|Debate Utility Arsenal)\b/gi,
  );
}

function isInsideHeadingSection(text: string, matchIndex: number, heading: RegExp): boolean {
  let match: RegExpExecArray | null;
  while ((match = heading.exec(text)) !== null) {
    const start = match.index;
    const afterStart = start + match[0].length;
    const after = text.slice(afterStart);
    const nextHeading = after.search(/\n##\s+/);
    const end = nextHeading < 0 ? text.length : afterStart + nextHeading;
    if (matchIndex >= start && matchIndex < end) return true;
    if (matchIndex < start) return false;
  }
  return false;
}

/** @deprecated Prefer isInsideNonProseCitationSection — kept for existing imports. */
export function isInsideRegistryEvidenceLandscape(text: string, matchIndex: number): boolean {
  return isInsideNonProseCitationSection(text, matchIndex);
}

function extractClaimTextForCitation(text: string, citationIndex: number): string {
  const beforeCitation = text.slice(0, citationIndex).trim();
  const lineStart = Math.max(beforeCitation.lastIndexOf("\n") + 1, 0);
  const lineBefore = beforeCitation.slice(lineStart).trim();
  const inlineClaim = cleanClaimText(lineBefore);
  if (inlineClaim.length >= 24) return inlineClaim;
  const sentences = beforeCitation.match(/[^.!?\n]+[.!?]?/g) ?? [];
  return cleanClaimText(sentences.at(-1) ?? beforeCitation);
}

function cleanClaimText(value: string): string {
  return value
    .replace(/\[Source\s+\d+\]\([^)]+\)/gi, "")
    .replace(/^[-*#\d.]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectUnsupportedCitationClaims(text: string): string[] {
  const issues: string[] = [];
  if (/\bfraud happened|election was stolen|evms? were manipulated\b/i.test(text)) issues.push("unsupported electoral fraud claim");
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? [text];
  for (const sentence of sentences) {
    if (/\b\d+(?:\.\d+)?%|\brank(?:ed)?\s+\d+/i.test(sentence) && !/\[Source\s+\d+\]\(https?:\/\//i.test(sentence)) issues.push(`number or rank without linked citation: ${sentence.trim().slice(0, 40)}...`);
  }
  return issues;
}

function sameUrl(a: string, b: string): boolean {
  try {
    return canonicalCitationUrl(a) === canonicalCitationUrl(b);
  } catch {
    return false;
  }
}

function canonicalCitationUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^utm_|fbclid|gclid|mc_cid/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.hostname = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^amp\./, "").toLowerCase();
  return parsed.toString().replace(/%28/gi, "(").replace(/%29/gi, ")").replace(/\/$/, "");
}

export interface CitationQualityGateResult {
  score: number;
  maxScore: number;
  issues: Array<{ code: string; message: string; severity: "fatal" | "warning" }>;
  linkedCitationCount: number;
}

/** Citation quality checks merged from the former citation-quality-gate sub-gate. */
export function runCitationQualityGate(
  text: string,
  registry: EvidenceRegistryCore,
): CitationQualityGateResult {
  const issues: CitationQualityGateResult["issues"] = [];
  let score = 15;
  const linked = [...text.matchAll(/\[Source\s+(\d+)\]\((https?:\/\/[^)]+)\)/gi)];
  if (linked.length === 0) {
    issues.push({ code: "zero_valid_citations", message: "zero valid citations", severity: "fatal" });
    score = 0;
  }
  if (/\[Source\s+\d+\](?!\()/i.test(text) || /\[Source\s+\d+\]\((?!https?:\/\/)/i.test(text)) {
    issues.push({ code: "fake_citations", message: "fake citations", severity: "fatal" });
    score = 0;
  }
  for (const match of linked) {
    const source = registry.getSource(Number(match[1]));
    if (!source || !sameUrl(source.url, match[2])) {
      issues.push({ code: "fake_citations", message: "fake citations", severity: "fatal" });
      score = 0;
      break;
    }
  }
  return { score, maxScore: 15, issues, linkedCitationCount: linked.length };
}
