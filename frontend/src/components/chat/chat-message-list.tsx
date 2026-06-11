import { useMemo } from "react";
import { sanitizeUrl, stripRawSourceJson } from "./chat-metadata-utils";
import { stripPipelineMetadata, type PipelineMetadata } from "@/lib/pipeline-metadata";
import { ThoughtBlock, extractThinking } from "./thought-block";

export interface CitationMessageSource {
  sourceId?: number;
  title?: string;
  url: string;
}

export type CitationPart =
  | { type: "text"; text: string }
  | { type: "source"; text: string; url: string; n: string };

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
  const { mainContent } = extractThinking(content);
  return cleanMessageContent(mainContent)
    // Preserve code block content but remove fences — keep line breaks (Bug: L21)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => code)
    .replace(/`([^`]+)`/g, "$1")
    // Fix image alt text crash — handle brackets inside alt text safely (Bug: L23)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    // Only strip markdown symbols that are NOT hyphens in words/numbers (Bug: L19, L26)
    // We strip: *, _, ~, # — but NOT - so "anti-gravity" and "-15%" are preserved
    .replace(/[*_~#]/g, "")
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
  // Fix: handle leading spaces/tabs before ## Sources (Bug: L41)
  const sourcesMatch = safeContent.match(/^[ \t]*##[ \t]*Sources?[ \t]*\n([\s\S]*?)(?=^[ \t]*##[ \t]|\s*$)/im);
  const mainContent = sourcesMatch ? safeContent.slice(0, sourcesMatch.index) : safeContent;
  const sourceById = new Map<number, CitationMessageSource>();
  sources.forEach((source, index) => {
    if (source.url) sourceById.set(source.sourceId ?? index + 1, source);
  });
  const trustedCitedIds = citationStatus ? new Set(citationStatus.citedSourceIds ?? []) : null;
  const parts: CitationPart[] = [];
  // Fix: also match [source N] (lowercase) and [Source N] without URL (Bug: L49)
  const sourcePattern = /\[[Ss]ource\s*(\d+)\]\((https?:\/\/[^)\s]+)\)|\[[Ss]ource\s*(\d+)\]|\[(\d{1,3})\]/g;
  let lastIndex = 0;

  for (const match of mainContent.matchAll(sourcePattern)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push({ type: "text", text: mainContent.slice(lastIndex, matchIndex) });
    }
    const sourceNumber = Number(match[1] ?? match[3] ?? match[4]);
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
    return sanitizeUrl(normalised);
  } catch {
    return null;
  }
}

export function CitationMessage({
  content,
  sources = [],
  citationStatus = null,
}: {
  content: string;
  sources?: CitationMessageSource[];
  citationStatus?: PipelineMetadata["citationStatus"] | null;
}) {
  // Extract <think> blocks before cleaning so we can render them as a collapsible ThoughtBlock
  const { thinking, mainContent: contentWithoutThinking, isThinkingFinished } = extractThinking(content);
  const safeContent = cleanMessageContent(contentWithoutThinking);
  // Fix: handle leading whitespace before ## Sources (Bug: L41)
  const sourcesMatch = safeContent.match(/^[ \t]*##[ \t]*Sources?[ \t]*\n([\s\S]*?)(?=^[ \t]*##[ \t]|\s*$)/im);
  const sourcesBlock = sourcesMatch ? sourcesMatch[1] : null;
  const renderedContent = useMemo(
    () => buildCitationParts({ content: safeContent, sources, citationStatus }),
    [citationStatus, safeContent, sources]
  );

  const sourceLines = sourcesBlock
    ? sourcesBlock
        .trim()
        .split("\n")
        .filter((l) => l.trim().length > 0)
    : [];

  return (
    <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
      {thinking && <ThoughtBlock thinking={thinking} isThinkingFinished={isThinkingFinished} />}
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere] md:text-[15px]">
        {renderedContent.map((part, i) =>
          part.type === "source" && part.url ? (
            // Fix: stop click propagation (Bug: L105), add focus outline (Bug: L111)
            <a
              key={`${part.n}-${i}`}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              className="citation-chip mx-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
              title={part.url}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Source ${part.n}`}
            >
              [{part.n}]
            </a>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )}
      </div>
      {((sourcesBlock && sourceLines.length > 0) || (sources && sources.length > 0)) && (
        <details className="not-prose mt-3 overflow-hidden rounded-lg border">
          <summary className="cursor-pointer select-none bg-muted/50 px-3 py-2 text-xs font-semibold hover:bg-muted">
            Sources ({sourceLines.length || sources.length})
          </summary>
          <div className="p-3 space-y-1.5">
            {sourceLines.length > 0 ? (
              sourceLines.map((line, i) => {
                const urlMatch = line.match(/https?:\/\/[^\s)>\]]+/);
                const url = urlMatch?.[0]?.replace(/[),.;\]]+$/, "");
                const originalIndex = line.match(/^\[?(\d+)\]?\.?\s/)?.[1];
                const label = originalIndex ? `[${originalIndex}]` : `[${i + 1}]`;

                return (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="font-mono shrink-0 text-[#6f93e8]">{label}</span>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline hover:text-foreground break-all"
                      >
                        {url}
                      </a>
                    ) : (
                      <span className="break-words">{line.replace(/^\[?\d+\]?\.?\s*/, "")}</span>
                    )}
                  </div>
                );
              })
            ) : (
              sources.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="font-mono shrink-0 text-[#6f93e8]">[{s.sourceId ?? i + 1}]</span>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-foreground break-all">
                      {s.title || s.url}
                    </a>
                  ) : (
                    <span className="break-words">{s.title || "Unknown source"}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </details>
      )}
    </div>
  );
}
