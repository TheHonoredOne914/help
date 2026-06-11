import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import { markdownCitationUrl } from "../evidence/evidence-registry.js";

export interface CitationValidationReport {
  passed: boolean;
  validatedCitations: number[];
  rejectedCitations: string[];
  unsupportedClaims: string[];
  missingSourceBuckets: string[];
  sourceIdsActuallyUsed: number[];
  uniqueCitedSourceCount: number;
  linkedCitationCount: number;
  invalidCitations: string[];
  citedBuckets: string[];
  repeatedCitationWarnings: string[];
}

export function validateCitations(text: string, registry: EvidenceRegistryCore, contract: AgendaContract): CitationValidationReport {
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
    citationCounts.set(id, (citationCounts.get(id) ?? 0) + 1);
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
    validatedCitations.push(id);
  }

  const sourceIdsActuallyUsed = [...new Set(validatedCitations)].sort((a, b) => a - b);
  const coveredBuckets = new Set(sourceIdsActuallyUsed.flatMap((id) => registry.getSource(id)?.bucketIds ?? []));
  const missingSourceBuckets = contract.requiredSourceBuckets
    .map((bucket) => bucket.bucketId)
    .filter((bucketId) => !coveredBuckets.has(bucketId as any));
  const unsupportedClaims = detectUnsupportedCitationClaims(text);
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
    && repeatedCitationWarnings.length === 0
    && !hasInflatedSourceCount
    && sourceIdsActuallyUsed.length >= requiredUniqueCoverage
    && !missingBucketCoverageFatal;
  return {
    passed,
    validatedCitations,
    rejectedCitations,
    unsupportedClaims,
    missingSourceBuckets,
    sourceIdsActuallyUsed,
    uniqueCitedSourceCount: sourceIdsActuallyUsed.length,
    linkedCitationCount: linkedMatches.length,
    invalidCitations: [...invalidCitations, ...unsupportedClaims, ...repeatedCitationWarnings],
    citedBuckets: [...coveredBuckets].sort(),
    repeatedCitationWarnings,
  };
}

export function linkBareSourceCitations(text: string, registry: EvidenceRegistryCore): string {
  return text.replace(/(?:\[|【|ã€)Source[\s\u00a0\u202f]+(\d+)(?:\]|】|ã€‘)(?!\()/gi, (match, rawId) => {
    const id = Number(rawId);
    const source = registry.getSource(id);
    if (!source?.citationEligible) return match;
    return `[Source ${id}](${markdownCitationUrl(source.url)})`;
  });
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
