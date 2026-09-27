import { sanitizeUrl, stripRawSourceJson } from "./chat-metadata-utils";
import { stripPipelineMetadata, type PipelineMetadata } from "@/lib/pipeline-metadata";
import { extractThinking } from "./thought-block";

export interface CitationMessageSource {
  sourceId?: number;
  title?: string;
  url: string;
}

export type CitationPart =
  | { type: "text"; text: string }
  | { type: "source"; text: string; url: string; n: string };

export function splitSourcesSection(content: string): { body: string; sourcesBlock: string | null } {
  const heading = /^[ \t]*##[ \t]*Sources?[ \t]*\r?\n/im.exec(content);
  if (!heading || heading.index == null) return { body: content, sourcesBlock: null };
  const afterHeading = content.slice(heading.index + heading[0].length);
  const nextHeading = /^[ \t]*##[ \t]/m.exec(afterHeading);
  const sourcesBlock = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading;
  return {
    body: content.slice(0, heading.index).replace(/[ \t]+$/g, ""),
    sourcesBlock,
  };
}

export function cleanMessageContent(content: string): string {
  // Strip HTML tags that may come from scraper fallbacks (Bug: L915)
  return stripRawSourceJson(stripPipelineMetadata(content))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p|span)[^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

export function prepareMessageForCopy(content: string): string {
  // Strip <think> blocks so only the main response is copied
  const { mainContent } = extractThinking(content, { streamEnded: true });
  return cleanMessageContent(mainContent)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => code)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildCitationParts({
  content,
  sources = [],
  citationStatus,
}: {
  content: string;
  sources?: CitationMessageSource[];
  citationStatus?: PipelineMetadata["citationStatus"] | null;
}): CitationPart[] {
  const safeContent = cleanMessageContent(content);
  const { body: mainContent } = splitSourcesSection(safeContent);
  const sourceById = new Map<number, CitationMessageSource>();
  sources.forEach((source, index) => {
    if (source.url) sourceById.set(source.sourceId ?? index + 1, source);
  });
  const trustedCitedIds = citationStatus ? new Set(citationStatus.citedSourceIds ?? []) : null;
  const parts: CitationPart[] = [];
  // Fix: also match [source N] (lowercase) and [Source N] without URL (Bug: L49)
  const sourcePattern = /\[[Ss]ource\s*(\d+)\]\((https?:\/\/[^)\s]+)\)|\[[Ss]ource\s*(\d+)\]/g;
  let lastIndex = 0;

  for (const match of mainContent.matchAll(sourcePattern)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push({ type: "text", text: mainContent.slice(lastIndex, matchIndex) });
    }
    const sourceNumber = Number(match[1] ?? match[3]);
    const mappedSource = sourceById.get(sourceNumber);
    // Fix: during streaming (trustedCitedIds is null), only render chip if we have a URL (Bug: L59)
    const allowedByBackend = !trustedCitedIds || trustedCitedIds.has(sourceNumber);
    const inlineUrl = match[2];
    const resolvedUrl = inlineUrl ?? mappedSource?.url ?? "";

    if (allowedByBackend && resolvedUrl) {
      // Fix: sanitizeUrl handles protocol-less URLs (Bug: L64)
      const safe = sanitizeCitationUrl(resolvedUrl);
      if (safe) {
        parts.push({
          type: "source",
          text: match[0],
          n: String(sourceNumber),
          url: safe,
        });
        lastIndex = matchIndex + match[0].length;
        continue;
      }
    }
    parts.push({ type: "text", text: match[0] });
    lastIndex = matchIndex + match[0].length;
  }
  if (lastIndex < mainContent.length) {
    parts.push({ type: "text", text: mainContent.slice(lastIndex) });
  }
  return parts;
}

/** Fix (Bug: L64): handle protocol-less URLs by prepending https:// */
function sanitizeCitationUrl(url: string): string | null {
  if (!url) return null;
  let normalised = url;
  if (!/^https?:\/\//i.test(url) && url.includes(".")) {
    normalised = `https://${url}`;
  }
  try {
    const safe = sanitizeUrl(normalised);
    if (!safe || safe === "#" || !/^https?:\/\//i.test(safe)) return null;
    return safe;
  } catch {
    return null;
  }
}
