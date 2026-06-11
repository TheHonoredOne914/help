import type { SearchResult } from "./types.js";
import { canonicalizeUrl } from "./rag.js";

export type NumberedSourceEntry = {
  id: number;
  title: string;
  url: string;
  snippet: string;
  sourceType?: SearchResult["sourceType"];
};

export type CitationCoverageReport = {
  coveragePct: number;
  citedIds: number[];
  missingIds: number[];
  eligibleIds: number[];
};

function sourceBadge(sourceType?: SearchResult["sourceType"]): string {
  if (sourceType === "government_india") return " [GOV.IN]";
  if (sourceType === "court_judgement") return " [COURT]";
  if (sourceType === "government_international") return " [INTL]";
  return "";
}

export function buildNumberedSourceEntries(allResults: SearchResult[], limit = 500): NumberedSourceEntry[] {
  const merged = new Map<string, SearchResult>();
  for (const result of allResults) {
    if (!result.url) continue;
    const key = canonicalizeUrl(result.url);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...result });
      continue;
    }

    const combinedSnippet = [existing.snippet, result.snippet].filter(Boolean).join(" ").trim().slice(0, 1000);
    merged.set(key, {
      ...existing,
      title: existing.title || result.title,
      snippet: combinedSnippet,
      score: Math.max(existing.score, result.score),
      sourceType: existing.sourceType ?? result.sourceType,
      reportType: existing.reportType ?? result.reportType,
      judgement: existing.judgement ?? result.judgement,
      engine: existing.engine ?? result.engine,
    });
  }

  return [...merged.values()].slice(0, limit).map((result, index) => ({
    id: index + 1,
    title: result.title || result.url,
    url: result.url,
    snippet: (() => {
      const rawContent = (result as SearchResult & { content?: string }).content || result.snippet || "";
      const isFullContent = rawContent.length > 1000;
      const snippetLimit = isFullContent ? 1500 : 400;
      return rawContent.replace(/\s+/g, " ").slice(0, snippetLimit);
    })(),
    sourceType: result.sourceType,
  }));
}

export function formatNumberedSourceList(allResults: SearchResult[], limit = 500): string {
  return buildNumberedSourceEntries(allResults, limit)
    .map((source) => {
      const isSnippetOnly = source.snippet.length < 400;
      const snippetWarning = isSnippetOnly ? " [SNIPPET ONLY — cite title/position only, not statistics]" : "";
      return [
        `Source ${source.id}${sourceBadge(source.sourceType)}${snippetWarning}: ${source.title}`,
        `Citation: [Source ${source.id}](${source.url})`,
        `URL: ${source.url}`,
        source.snippet ? `Context: ${source.snippet}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function idsFromList(idsText: string): number[] {
  return idsText
    .split(/\s*,\s*/)
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export function normalizeSourceCitations(answer: string, allResults: SearchResult[], limit = 500): string {
  if (!answer) return answer;

  const sources = buildNumberedSourceEntries(allResults, limit);
  const urlById = new Map(sources.map((source) => [source.id, source.url]));
  const sourceLink = (id: number): string | null => {
    const url = urlById.get(id);
    return url ? `[Source ${id}](${url})` : null;
  };

  return answer
    .replace(/\[(\d+)\]\((https?:\/\/[^)]+)\)/gi, "[Source $1]($2)")
    .replace(/\[Sources?\s+(\d+(?:\s*,\s*\d+)+)\](?!\()/gi, (match, idsText: string) => {
      const links = idsFromList(idsText).map(sourceLink).filter((link): link is string => Boolean(link));
      return links.length > 0 ? links.join(", ") : match;
    })
    .replace(/\[Sources?\s+(\d+)\](?!\()/gi, (match, idText: string) => {
      return sourceLink(Number(idText)) ?? match;
    })
    .replace(/\[(\d+)\](?!\()/gi, (match, idText: string) => {
      return sourceLink(Number(idText)) ?? match;
    });
}

export function extractCitedSourceIds(text: string): number[] {
  const ids = new Set<number>();
  // Standard format: [Source N](url)
  const linkedRe = /\[Source\s*(\d+)\]\(/gi;
  let match: RegExpExecArray | null;
  while ((match = linkedRe.exec(text))) {
    const id = Number(match[1]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  // Residual grouped format (shouldn't exist after fixGroupedCitations, but safety net)
  const groupedRe = /\[Source\s*([\d,\s]+)\]/gi;
  while ((match = groupedRe.exec(text))) {
    match[1].split(",").forEach((s) => {
      const n = Number(s.trim());
      if (Number.isInteger(n) && n > 0) ids.add(n);
    });
  }
  return [...ids].sort((a, b) => a - b);
}

export function computeCitationCoverage(answer: string, eligibleCount: number): CitationCoverageReport {
  const citedIds = extractCitedSourceIds(answer);
  const eligibleIds = Array.from({ length: eligibleCount }, (_, index) => index + 1);
  const missingIds = eligibleIds.filter((id) => !citedIds.includes(id));
  const coveragePct = eligibleCount > 0 ? Math.round(((eligibleCount - missingIds.length) / eligibleCount) * 100) : 100;
  return { coveragePct, citedIds, missingIds, eligibleIds };
}

export function computeCitationCoverageStrict(
  text: string,
  sourceEntries: Array<{ index: number; url: string }>,
): {
  coveragePct: number;
  citedIds: number[];
  missingIds: number[];
  urlMismatchIds: number[];
} {
  const urlMismatchIds: number[] = [];
  const citedIds: number[] = [];

  for (const entry of sourceEntries) {
    const citationPattern = new RegExp(`\\[Source\\s+${entry.index}\\]\\(([^)]+)\\)`, "gi");
    const matches = [...text.matchAll(citationPattern)];
    if (matches.length === 0) continue;

    const citedUrl = matches[0]?.[1] ?? "";
    try {
      const expectedHost = new URL(entry.url).hostname.replace(/^www\./, "");
      const citedHost = new URL(citedUrl).hostname.replace(/^www\./, "");
      if (citedHost === expectedHost || citedHost.endsWith(`.${expectedHost}`) || expectedHost.endsWith(`.${citedHost}`)) {
        citedIds.push(entry.index);
      } else {
        urlMismatchIds.push(entry.index);
      }
    } catch {
      urlMismatchIds.push(entry.index);
    }
  }

  const missingIds = sourceEntries
    .map((entry) => entry.index)
    .filter((id) => !citedIds.includes(id) && !urlMismatchIds.includes(id));
  const coveragePct = sourceEntries.length > 0
    ? Math.round((citedIds.length / sourceEntries.length) * 100)
    : 100;

  return { coveragePct, citedIds, missingIds, urlMismatchIds };
}
